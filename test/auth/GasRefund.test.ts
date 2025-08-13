// SPDX-License-Identifier: MIT
// New gas refund tests using GasRefundAction and module-provided context

import { expect } from 'chai';
import { ethers, HardhatEthersSigner } from '..';
import { network } from 'hardhat';
import * as utils from '../utils';
import * as eip712Utils from '../utils-eip712';
import { fundAccountWithToken } from '../utils-stable';
import { tokenConfig } from '../constants';

import {
  EIP712TypedDataSafeModule,
  ISafe,
  TokenRegistry,
  IAggregatorV3,
  IERC20,
  AdminVault,
} from '../../typechain-types';

// Minimal interface for GasRefundAction
const GAS_REFUND_ACTION_ABI = ['function executeAction(bytes,uint16) external payable'];

// Helper to encode GasRefundAction params and callData
function encodeGasRefundActionCall(params: {
  refundToken: string;
  maxRefundAmount: bigint;
  refundRecipient: number; // 0 executor, 1 fee recipient
}) {
  const paramsTuple = ethers.AbiCoder.defaultAbiCoder().encode(
    ['tuple(address,uint256,uint8)'],
    [[params.refundToken, params.maxRefundAmount, params.refundRecipient]]
  );
  const iface = new ethers.Interface(GAS_REFUND_ACTION_ABI);
  // strategyId not relevant for refund action; pass 0
  return iface.encodeFunctionData('executeAction', [paramsTuple, 0]);
}

// Helper to build a sequence that includes only the GasRefundAction
async function buildRefundOnlySequence(
  gasRefundActionAddress: string,
  params: { refundToken: string; maxRefundAmount: bigint; refundRecipient: number }
) {
  const callData = encodeGasRefundActionCall(params);
  // actionId convention in tests: bytes4(keccak256(address)) helper
  const actionId = (await import('../shared-utils')).getBytes4(gasRefundActionAddress);
  const actionDefinition: eip712Utils.ActionDefinition = {
    protocolName: 'Brava',
    actionType: 4, // FEE_ACTION
  };
  return {
    actions: [actionDefinition],
    actionIds: [actionId],
    callData: [callData],
  };
}

describe('Gas Refund via GasRefundAction', function () {
  let admin: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let adminAddress: string;
  let aliceAddress: string;
  let bobAddress: string;

  let adminVault: AdminVault;
  let eip712Module: EIP712TypedDataSafeModule;
  let tokenRegistry: TokenRegistry;
  let ethUsdOracle: IAggregatorV3;
  let usdc: IERC20;
  let dai: IERC20;
  let aliceSafe: ISafe;
  let aliceSafeAddress: string;

  let gasRefundActionAddress: string;

  let snapshotId: string;

  // Test configuration
  const REFUND_AMOUNT = ethers.parseUnits('1000', 6); // 1000 USDC
  const HIGH_GAS_PRICE = ethers.parseUnits('100', 9); // 100 Gwei
  const LOW_GAS_PRICE = ethers.parseUnits('10', 9); // 10 Gwei

  before(async function () {
    // Get signers
    const signers = await ethers.getSigners();
    admin = signers[0];
    alice = signers[1];
    bob = signers[2];
    adminAddress = await admin.getAddress();
    aliceAddress = await alice.getAddress();
    bobAddress = await bob.getAddress();

    // Get base setup
    const baseSetup = await utils.getBaseSetup(admin);
    if (!baseSetup) {
      throw new Error('Base setup not deployed');
    }

    adminVault = baseSetup.adminVault;
    eip712Module = baseSetup.eip712Module;
    tokenRegistry = baseSetup.tokenRegistry;
    ethUsdOracle = baseSetup.mockChainlinkOracle; // Now using real Chainlink oracle

    // Deploy Alice's Safe
    aliceSafeAddress = await utils.deployBravaSafe(alice, baseSetup.safeDeployment, eip712Module);
    aliceSafe = await utils.getTypedContract<ISafe>('ISafe', aliceSafeAddress);

    // Get real mainnet stablecoins only
    usdc = await utils.getTypedContract<IERC20>('IERC20', tokenConfig.USDC.address);
    dai = await utils.getTypedContract<IERC20>('IERC20', tokenConfig.DAI.address);

    // Add approved stablecoins to registry
    const tokenAddresses = [tokenConfig.USDC.address, tokenConfig.DAI.address];
    for (const tokenAddress of tokenAddresses) {
      await tokenRegistry.connect(admin).proposeToken(tokenAddress);
      await tokenRegistry.connect(admin).approveToken(tokenAddress);
    }

    // Funding happens per test case to ensure isolation

    // Deploy GasRefundAction and register
    const logger = (await utils.getGlobalSetup()).logger;
    const factory = await ethers.getContractFactory('GasRefundAction', admin);
    const contract = await factory.deploy(
      await adminVault.getAddress(),
      await logger.getAddress(),
      await tokenRegistry.getAddress(),
      await ethUsdOracle.getAddress(),
      adminAddress,
      await eip712Module.getAddress()
    );
    await contract.waitForDeployment();
    gasRefundActionAddress = await contract.getAddress();

    // Register GasRefundAction
    const { getBytes4 } = await import('../shared-utils');
    const actionId = getBytes4(gasRefundActionAddress);
    await adminVault.connect(admin).proposeAction(actionId, gasRefundActionAddress);
    await adminVault.connect(admin).addAction(actionId, gasRefundActionAddress);
  });

  beforeEach(async function () {
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async function () {
    await network.provider.send('evm_revert', [snapshotId]);
  });

  async function setGasPrice(gasPrice: bigint) {
    await network.provider.send('hardhat_setNextBlockBaseFeePerGas', [
      '0x' + gasPrice.toString(16),
    ]);
  }

  async function executeBundleWithRefund(params: {
    refundToken: string;
    maxRefundAmount: bigint;
    refundRecipient: number;
  }) {
    // Ensure nonzero gas price so refunds compute > 0
    await setGasPrice(ethers.parseUnits('100', 9));

    const currentNonce = await eip712Module.getSequenceNonce(aliceSafeAddress);
    const { actions, actionIds, callData } = await buildRefundOnlySequence(
      gasRefundActionAddress,
      params
    );

    const bundle = eip712Utils.createBundle({
      actions,
      actionIds,
      callData,
      chainId: BigInt(31337),
      sequenceNonce: currentNonce,
      sequenceName: 'Gas Refund',
      enableGasRefund: true,
      refundToken: params.refundToken,
      maxRefundAmount: params.maxRefundAmount,
      refundRecipient: params.refundRecipient,
    });

    const signature = await eip712Utils.signBundle(alice, bundle, aliceSafeAddress);
    const tx = await eip712Module.connect(bob).executeBundle(aliceSafeAddress, bundle, signature);
    await tx.wait();
  }

  it('refunds USDC to the executor when funded and token approved', async function () {
    // Fund Safe with USDC
    const fundAmount = ethers.parseUnits('1000', 6);
    await fundAccountWithToken(aliceSafeAddress, 'USDC', fundAmount);

    const balanceBefore = await usdc.balanceOf(bobAddress);

    await executeBundleWithRefund({
      refundToken: tokenConfig.USDC.address,
      maxRefundAmount: ethers.parseUnits('50', 6),
      refundRecipient: eip712Utils.RefundRecipient.EXECUTOR,
    });

    const balanceAfter = await usdc.balanceOf(bobAddress);
    expect(balanceAfter).to.be.gt(balanceBefore);
    expect(balanceAfter - balanceBefore).to.be.lte(ethers.parseUnits('50', 6));
  });

  it('refunds to fee recipient when selected', async function () {
    // Fund Safe with DAI
    const fundAmount = ethers.parseUnits('500', 18);
    await fundAccountWithToken(aliceSafeAddress, 'DAI', fundAmount);

    const feeRecipient = adminAddress; // set in constructor
    const balanceBefore = await dai.balanceOf(feeRecipient);

    await executeBundleWithRefund({
      refundToken: tokenConfig.DAI.address,
      maxRefundAmount: ethers.parseUnits('25', 18),
      refundRecipient: eip712Utils.RefundRecipient.FEE_RECIPIENT,
    });

    const balanceAfter = await dai.balanceOf(feeRecipient);
    expect(balanceAfter).to.be.gt(balanceBefore);
    expect(balanceAfter - balanceBefore).to.be.lte(ethers.parseUnits('25', 18));
  });

  it('does not revert if Safe lacks funds; refund is skipped', async function () {
    const balanceBefore = await usdc.balanceOf(bobAddress);

    await executeBundleWithRefund({
      refundToken: tokenConfig.USDC.address,
      maxRefundAmount: ethers.parseUnits('10', 6),
      refundRecipient: eip712Utils.RefundRecipient.EXECUTOR,
    });

    const balanceAfter = await usdc.balanceOf(bobAddress);
    expect(balanceAfter).to.equal(balanceBefore);
  });

  it('does not revert for unapproved token; refund is skipped', async function () {
    // Use a random address as token (will fail metadata/registry checks)
    const randomToken = ethers.Wallet.createRandom().address;
    const executorBefore = await usdc.balanceOf(bobAddress);

    await executeBundleWithRefund({
      refundToken: randomToken,
      maxRefundAmount: ethers.parseUnits('10', 6),
      refundRecipient: eip712Utils.RefundRecipient.EXECUTOR,
    });

    const executorAfter = await usdc.balanceOf(bobAddress);
    expect(executorAfter).to.equal(executorBefore);
  });

  it('no refund if refund action not included', async function () {
    await setGasPrice(ethers.parseUnits('100', 9));

    const currentNonce = await eip712Module.getSequenceNonce(aliceSafeAddress);

    const emptyActions: eip712Utils.ActionDefinition[] = [];
    const emptyIds: string[] = [];
    const emptyCalldata: string[] = [];

    const bundle = eip712Utils.createBundle({
      actions: emptyActions,
      actionIds: emptyIds,
      callData: emptyCalldata,
      chainId: BigInt(31337),
      sequenceNonce: currentNonce,
      sequenceName: 'No Refund',
      enableGasRefund: false,
      refundToken: tokenConfig.USDC.address,
      maxRefundAmount: ethers.parseUnits('50', 6),
      refundRecipient: eip712Utils.RefundRecipient.EXECUTOR,
    });

    const balanceBefore = await usdc.balanceOf(bobAddress);
    const signature = await eip712Utils.signBundle(alice, bundle, aliceSafeAddress);
    const tx = await eip712Module.connect(bob).executeBundle(aliceSafeAddress, bundle, signature);
    await tx.wait();

    const balanceAfter = await usdc.balanceOf(bobAddress);
    expect(balanceAfter).to.equal(balanceBefore);
  });
});
