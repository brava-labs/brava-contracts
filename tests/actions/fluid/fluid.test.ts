import { ethers, Signer, expect, utils } from '../..';
import { network } from 'hardhat';
import { IERC20, FluidSupply } from '../../../typechain-types';
import { deploy, log, getBaseSetup } from '../../utils';
import { executeSafeTransaction, FluidSupplyAction, FluidWithdrawAction } from 'athena-sdk';
import { fundAccountWithStablecoin, getUSDC } from '../../utils-stable';

describe('Fluid Supply and Withdraw tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let snapshotId: string;
  let USDC: IERC20;
  let fluidSupplyContract: FluidSupply;

  before(async () => {
    [signer] = await ethers.getSigners();
    const baseSetup = await getBaseSetup();
    safeAddr = baseSetup.safeAddr;

    // Fetch the USDC token
    USDC = await getUSDC();

    // Initialize FluidSupply and FluidWithdraw actions
    fluidSupplyContract = await deploy(
      'FluidSupply',
      signer,
      await baseSetup.contractRegistry.getAddress(),
      await baseSetup.logger.getAddress()
    );

    // Take local snapshot before running tests
    log('Taking local snapshot');
    snapshotId = await network.provider.send('evm_snapshot');
  });

  beforeEach(async () => {});

  afterEach(async () => {
    // Revert local snapshot after each test
    log('Reverting to local snapshot');
    await network.provider.send('evm_revert', [snapshotId]);

    // IMPORTANT: take a new snapshot, they can't be reused!
    snapshotId = await network.provider.send('evm_snapshot');
  });

  it.skip('Should execute Fluid Supply', async () => {
    const supplyAmount = utils.formatAmount(BigInt(1), 6);
    const fluidSupplyAction = new FluidSupplyAction(
      '0x9Fb7b4477576Fe5B32be4C1843aFB1e55F251B33',
      supplyAmount.toString(),
      safeAddr,
      safeAddr
    );
    const supplyTxPayload = await fluidSupplyAction.encodeArgs();

    // fund safe with USDC
    await fundAccountWithStablecoin(safeAddr, 'USDC', 100000000);

    await executeSafeTransaction(
      safeAddr,
      await fluidSupplyContract.getAddress(),
      0,
      supplyTxPayload,
      1,
      signer
    );

    // Add assertions to check if supply was successful
    // For example, check token balance changes
  });

  //   it('Should execute Fluid Withdraw', async () => {
  //     const withdrawAmount = ethers.utils.parseEther('50');
  //     const withdrawTx = await fluidWithdraw.build(
  //       safeAddr,
  //       testToken.address,
  //       withdrawAmount
  //       // Add other necessary parameters
  //     );

  //     await executeSafeTransaction(safeAddr, withdrawTx);

  //     // Add assertions to check if withdraw was successful
  //     // For example, check token balance changes
  //   });
});

export {};
