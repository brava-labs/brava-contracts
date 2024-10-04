import { expect, ethers, Signer } from './.';
import { network } from 'hardhat';
import {
  encodeAction,
  getBaseSetup,
  deploy,
  getBytes4,
  executeSequence,
  executeAction,
  log,
} from './utils';
import { fundAccountWithToken } from './utils-stable';
import { tokenConfig } from './constants';
import { AdminVault, FluidSupply, FluidWithdraw, SequenceExecutor } from '../typechain-types';

describe.only('Sequence tests', () => {
  let snapshotId: string;
  let signer: Signer;
  let safeAddr: string;
  let adminVault: AdminVault;
  let fluidSupplyAction: FluidSupply;
  let fluidWithdrawAction: FluidWithdraw;
  let loggerAddress: string;
  let fluidSupplyAddress: string;
  let fluidWithdrawAddress: string;
  let sequenceExecutor: SequenceExecutor;
  before(async () => {
    [signer] = await ethers.getSigners();
    const baseSetup = await getBaseSetup(signer);
    if (!baseSetup) {
      throw new Error('Base setup not found');
    }
    safeAddr = await baseSetup.safe.getAddress();
    adminVault = await baseSetup.adminVault;
    loggerAddress = await baseSetup.logger.getAddress();

    sequenceExecutor = await deploy('SequenceExecutor', signer, await adminVault.getAddress());

    // we need a couple of actions to test with
    fluidSupplyAction = await deploy(
      'FluidSupply',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    fluidWithdrawAction = await deploy(
      'FluidWithdraw',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    fluidSupplyAddress = await fluidSupplyAction.getAddress();
    fluidWithdrawAddress = await fluidWithdrawAction.getAddress();
    await adminVault.proposeAction(getBytes4(fluidSupplyAddress), fluidSupplyAddress);
    await adminVault.proposeAction(getBytes4(fluidWithdrawAddress), fluidWithdrawAddress);
    await adminVault.addAction(getBytes4(fluidSupplyAddress), fluidSupplyAddress);
    await adminVault.addAction(getBytes4(fluidWithdrawAddress), fluidWithdrawAddress);
    const FLUID_USDC_ADDRESS = tokenConfig.fUSDC.address;
    await adminVault.proposePool(
      'Fluid',
      ethers.keccak256(FLUID_USDC_ADDRESS).slice(0, 10),
      FLUID_USDC_ADDRESS
    );
    await adminVault.addPool(
      'Fluid',
      ethers.keccak256(FLUID_USDC_ADDRESS).slice(0, 10),
      FLUID_USDC_ADDRESS
    );
  });
  beforeEach(async () => {
    // IMPORTANT: take a new snapshot, they can't be reused!
    log('Taking local snapshot');
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    log('Reverting to local snapshot');
    await network.provider.send('evm_revert', [snapshotId]);
  });
  after(async () => {});
  it('should be able to execute a sequence of actions', async () => {
    // Lets start with doing fluid supply and then fluid withdraw
    const amount = ethers.parseUnits('100', tokenConfig.USDC.decimals);
    await fundAccountWithToken(safeAddr, 'USDC', amount);
    await fundAccountWithToken(safeAddr, 'USDC', amount);
    const payloadSupply = await encodeAction({
      type: 'FluidSupply',
      amount,
    });
    const payloadWithdraw = await encodeAction({
      type: 'FluidWithdraw',
      amount,
    });
    const sequence: SequenceExecutor.SequenceStruct = {
      name: 'FluidSupplySequence',
      callData: [payloadSupply, payloadWithdraw],
      actionIds: [getBytes4(fluidSupplyAddress), getBytes4(fluidWithdrawAddress)],
    };
    const tx = await executeSequence(safeAddr, sequence);
    await tx.wait();
  });
});
