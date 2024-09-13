import { network } from 'hardhat';
import { ethers, Signer } from '../..';
import { FluidSupply, IERC20 } from '../../../typechain-types';
import { deploy, getBaseSetup, log } from '../../utils';
import { getUSDC } from '../../utils-stable';

describe('Fee Take tests', () => {
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

  it.skip('Should execute take fee', async () => {});
});

export {};
