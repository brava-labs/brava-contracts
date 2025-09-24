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
function encodeGasRefundActionCall(params: { maxRefundAmount: bigint }) {
  const paramsTuple = ethers.AbiCoder.defaultAbiCoder().encode(
    ['tuple(uint256)'],
    [[params.maxRefundAmount]]
  );
  const iface = new ethers.Interface(GAS_REFUND_ACTION_ABI);
  // strategyId not relevant for refund action; pass 0
  return iface.encodeFunctionData('executeAction', [paramsTuple, 0]);
}

// Helper to build a sequence that includes only the GasRefundAction
async function buildRefundOnlySequence(
  gasRefundActionAddress: string,
  params: { maxRefundAmount: bigint }
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

    // Deploy GasRefundAction and register
    const logger = (await utils.getGlobalSetup()).logger;
    const factory = await ethers.getContractFactory('GasRefundAction', admin);
    const contract = await (factory as any).deploy(
      await adminVault.getAddress(),
      await logger.getAddress(),
      await eip712Module.getAddress(),
      tokenConfig.USDC.address
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
    maxRefundAmount: bigint;
    refundRecipient?: number;
  }) {
    // Ensure nonzero gas price so refunds compute > 0
    await setGasPrice(HIGH_GAS_PRICE);

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
      maxRefundAmount: params.maxRefundAmount,
      refundRecipient: params.refundRecipient ?? 0,
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
      maxRefundAmount: ethers.parseUnits('50', 6),
    });

    const balanceAfter = await usdc.balanceOf(bobAddress);
    expect(balanceAfter).to.be.gt(balanceBefore);
    expect(balanceAfter - balanceBefore).to.be.lte(ethers.parseUnits('50', 6));
  });

  it('refunds to fee recipient when selected', async function () {
    // Fund Safe with USDC (refund token)
    const fundAmount = ethers.parseUnits('500', 6);
    await fundAccountWithToken(aliceSafeAddress, 'USDC', fundAmount);

    const feeRecipient = adminAddress; // set in constructor
    const balanceBefore = await usdc.balanceOf(feeRecipient);

    await executeBundleWithRefund({
      maxRefundAmount: ethers.parseUnits('25', 6),
      refundRecipient: 1, // send to fee recipient
    });

    const balanceAfter = await usdc.balanceOf(feeRecipient);
    expect(balanceAfter).to.be.gt(balanceBefore);
    expect(balanceAfter - balanceBefore).to.be.lte(ethers.parseUnits('25', 6));
  });

  it('does not revert if Safe lacks funds; refund is skipped', async function () {
    const balanceBefore = await usdc.balanceOf(bobAddress);

    await executeBundleWithRefund({
      maxRefundAmount: ethers.parseUnits('10', 6),
    });

    const balanceAfter = await usdc.balanceOf(bobAddress);
    expect(balanceAfter).to.equal(balanceBefore);
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
      maxRefundAmount: ethers.parseUnits('50', 6),
      refundRecipient: 0,
    });

    const balanceBefore = await usdc.balanceOf(bobAddress);
    const signature = await eip712Utils.signBundle(alice, bundle, aliceSafeAddress);
    const tx = await eip712Module.connect(bob).executeBundle(aliceSafeAddress, bundle, signature);
    await tx.wait();

    const balanceAfter = await usdc.balanceOf(bobAddress);
    expect(balanceAfter).to.equal(balanceBefore);
  });

  it('caps refund at typed max and returns remainder to Safe', async function () {
    // Fund Safe with a lot of USDC and deposit a large amount via action
    await fundAccountWithToken(aliceSafeAddress, 'USDC', ethers.parseUnits('1000', 6));

    // Push gas price very high so computed refund > typed max
    await setGasPrice(ethers.parseUnits('1000', 9));

    const typedMax = ethers.parseUnits('10', 6);

    const executorBefore = await usdc.balanceOf(bobAddress);
    const safeBefore = await usdc.balanceOf(aliceSafeAddress);

    const currentNonce = await eip712Module.getSequenceNonce(aliceSafeAddress);
    const { actions, actionIds, callData } = await buildRefundOnlySequence(
      gasRefundActionAddress,
      { maxRefundAmount: ethers.parseUnits('100', 6) } // deposit up to 100 USDC
    );

    const bundle = eip712Utils.createBundle({
      actions,
      actionIds,
      callData,
      chainId: BigInt(31337),
      sequenceNonce: currentNonce,
      sequenceName: 'Refund Cap Test',
      enableGasRefund: true,
      maxRefundAmount: typedMax,
      refundRecipient: 0,
    });

    const signature = await eip712Utils.signBundle(alice, bundle, aliceSafeAddress);
    await eip712Module.connect(bob).executeBundle(aliceSafeAddress, bundle, signature).then(r => r.wait());

    const executorAfter = await usdc.balanceOf(bobAddress);
    const safeAfter = await usdc.balanceOf(aliceSafeAddress);
    const moduleBal = await usdc.balanceOf(await eip712Module.getAddress());

    // Executor should receive exactly typed max (refund capped)
    expect(executorAfter - executorBefore).to.equal(typedMax);
    // Safe net decrease equals the amount paid to executor (remainder returned)
    expect(safeBefore - safeAfter).to.equal(typedMax);
    // Module should not retain any funds
    expect(moduleBal).to.equal(0n);
  });

  it('reverts if enableGasRefund=true but refund action missing', async function () {
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
      sequenceName: 'Missing Refund Action',
      enableGasRefund: true,
      maxRefundAmount: ethers.parseUnits('5', 6),
      refundRecipient: 0,
    });

    const signature = await eip712Utils.signBundle(alice, bundle, aliceSafeAddress);
    await expect(
      eip712Module.connect(bob).executeBundle(aliceSafeAddress, bundle, signature)
    ).to.be.revertedWithCustomError(eip712Module, 'EIP712TypedDataSafeModule_RefundActionRequired');
  });

  it('reverts if enableGasRefund=false but refund action is present', async function () {
    const currentNonce = await eip712Module.getSequenceNonce(aliceSafeAddress);
    const { actions, actionIds, callData } = await buildRefundOnlySequence(
      gasRefundActionAddress,
      { maxRefundAmount: ethers.parseUnits('5', 6) }
    );

    const bundle = eip712Utils.createBundle({
      actions,
      actionIds,
      callData,
      chainId: BigInt(31337),
      sequenceNonce: currentNonce,
      sequenceName: 'Refund Not Allowed',
      enableGasRefund: false,
      maxRefundAmount: ethers.parseUnits('5', 6),
      refundRecipient: 0,
    });

    const signature = await eip712Utils.signBundle(alice, bundle, aliceSafeAddress);
    await expect(
      eip712Module.connect(bob).executeBundle(aliceSafeAddress, bundle, signature)
    ).to.be.revertedWithCustomError(eip712Module, 'EIP712TypedDataSafeModule_RefundActionNotAllowed');
  });

  it('reverts on invalid refund recipient value', async function () {
    const currentNonce = await eip712Module.getSequenceNonce(aliceSafeAddress);
    const { actions, actionIds, callData } = await buildRefundOnlySequence(
      gasRefundActionAddress,
      { maxRefundAmount: ethers.parseUnits('5', 6) }
    );

    const bundle = eip712Utils.createBundle({
      actions,
      actionIds,
      callData,
      chainId: BigInt(31337),
      sequenceNonce: currentNonce,
      sequenceName: 'Invalid Refund Recipient',
      enableGasRefund: true,
      maxRefundAmount: ethers.parseUnits('5', 6),
      refundRecipient: 2, // invalid, only 0 or 1 allowed
    });

    const signature = await eip712Utils.signBundle(alice, bundle, aliceSafeAddress);
    await expect(
      eip712Module.connect(bob).executeBundle(aliceSafeAddress, bundle, signature)
    ).to.be.revertedWithCustomError(eip712Module, 'EIP712TypedDataSafeModule_InvalidRefundRecipient');
  });
});
