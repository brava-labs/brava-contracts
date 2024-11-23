import { network } from 'hardhat';
import {
  AdminVault,
  Curve3PoolSwap,
  FluidSupply,
  FluidWithdraw,
  SequenceExecutor,
} from '../typechain-types';
import { ethers, Signer } from './.';
import { CURVE_3POOL_ADDRESS, tokenConfig } from './constants';
import { deploy, encodeAction, executeSequence, getBaseSetup, getBytes4, log } from './utils';
import { fundAccountWithToken } from './utils-stable';

describe('Sequence tests', () => {
  let snapshotId: string;
  let signer: Signer;
  let safeAddr: string;
  let adminVault: AdminVault;
  let fluidSupplyAction: FluidSupply;
  let fluidWithdrawAction: FluidWithdraw;
  let swapAction: Curve3PoolSwap;
  let loggerAddress: string;
  let fluidSupplyAddress: string;
  let fluidWithdrawAddress: string;
  let swapActionAddress: string;
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
    swapAction = await deploy(
      'Curve3PoolSwap',
      signer,
      await adminVault.getAddress(),
      loggerAddress,
      CURVE_3POOL_ADDRESS
    );
    fluidSupplyAddress = await fluidSupplyAction.getAddress();
    fluidWithdrawAddress = await fluidWithdrawAction.getAddress();
    swapActionAddress = await swapAction.getAddress();
    await adminVault.proposeAction(getBytes4(fluidSupplyAddress), fluidSupplyAddress);
    await adminVault.proposeAction(getBytes4(fluidWithdrawAddress), fluidWithdrawAddress);
    await adminVault.proposeAction(getBytes4(swapActionAddress), swapActionAddress);
    await adminVault.addAction(getBytes4(fluidSupplyAddress), fluidSupplyAddress);
    await adminVault.addAction(getBytes4(fluidWithdrawAddress), fluidWithdrawAddress);
    await adminVault.addAction(getBytes4(swapActionAddress), swapActionAddress);
    const FLUID_USDC_ADDRESS = tokenConfig.fUSDC.address;
    await adminVault.proposePool('Fluid', FLUID_USDC_ADDRESS);
    await adminVault.addPool('Fluid', FLUID_USDC_ADDRESS);
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
  it('should be able to execute a complex sequence of actions', async () => {
    // Lets deposit Dai, swap half to USDC and half to USDT, put the USDT into Fluid  and the USDC into Yearn. Also purchase insurance.

    const amount = ethers.parseUnits('1000', tokenConfig.DAI.decimals);
    await fundAccountWithToken(safeAddr, 'DAI', amount);

    const usdcSwap = await encodeAction({
      type: 'Curve3PoolSwap',
      tokenIn: 'DAI',
      tokenOut: 'USDC',
      amount: BigInt(amount) / 2n,
    });
    const usdtSwap = await encodeAction({
      type: 'Curve3PoolSwap',
      tokenIn: 'DAI',
      tokenOut: 'USDT',
      amount: BigInt(amount) / 2n,
    });
    // TODO: We need some basic conversions before we can give input amounts for subsequent actions.
    // const fluidSupply = await encodeAction({
    //   type: 'FluidSupply',
    //   amount: BigInt(amount) / 3n,
    // });
    // const yearnSupply = await encodeAction({
    //   type: 'YearnSupply',
    //   amount,
    // });

    // const insurancePurchase = await encodeAction({
    //   type: 'NexusCover',
    //   amount,
    // });

    // const tx = await executeAction({
    //   type: 'Curve3PoolSwap',
    //   tokenIn: 'DAI',
    //   tokenOut: 'USDC',
    //   amount: BigInt(amount),
    // });

    const sequence: SequenceExecutor.SequenceStruct = {
      name: 'ComplexSequence',
      callData: [usdcSwap, usdtSwap],
      actionIds: [
        getBytes4(swapActionAddress),
        getBytes4(swapActionAddress),
        // getBytes4(fluidSupplyAddress),
        // getBytes4(yearnSupplyAddress),
        // getBytes4(nexusCoverAddress),
      ],
    };
    const tx = await executeSequence(safeAddr, sequence);
    await tx.wait();
  });
});
