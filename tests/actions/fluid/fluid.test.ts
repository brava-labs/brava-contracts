import { expect, ethers, Signer } from '../..';
import { hardhatArguments, network } from 'hardhat';
import {
  executeSafeTransaction,
  FluidSupplyAction,
  FluidWithdrawAction,
  Sequence,
} from 'athena-sdk';
import { IERC20, FluidSupply, FluidWithdraw, IFluidLending } from '../../../typechain-types';
import { deploy, getBaseSetup, log } from '../../utils';
import { fundAccountWithToken, getUSDC, getUSDT } from '../../utils-stable';
import { tokenConfig } from '../../../tests/constants';
import { FluidSupplyParams } from '../../params';

interface FluidSupplyParams {
  token: string;
  amount: string;
}

describe('Fluid tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let snapshotId: string;
  let USDC: IERC20;
  let USDT: IERC20;
  let fluidSupplyContract: FluidSupply;
  let fluidWithdrawContract: FluidWithdraw;
  let fUSDC: IFluidLending;
  let fUSDT: IFluidLending;
  const FLUID_USDC_ADDRESS = tokenConfig.fUSDC.address;
  const FLUID_USDT_ADDRESS = tokenConfig.fUSDT.address;

  // function to take in params and return encoded function call
  function getEncodedFunctionCall(params: FluidSupplyParams) {
    const abiCoder = new ethers.AbiCoder();
    const paramsEncoded = abiCoder.encode([FluidSupplyParams], [params]);

    const encodedFunctionCall = fluidSupplyContract.interface.encodeFunctionData('executeAction', [
      paramsEncoded,
      [0, 0],
      [],
      42,
    ]);

    return encodedFunctionCall;
  }

  before(async () => {
    [signer] = await ethers.getSigners();
    const baseSetup = await getBaseSetup();
    safeAddr = baseSetup.safeAddr;

    // Fetch the USDC token
    USDC = await getUSDC();
    USDT = await getUSDT();

    // Initialize FluidSupply and FluidWithdraw actions
    fluidSupplyContract = await deploy(
      'FluidSupply',
      signer,
      await baseSetup.contractRegistry.getAddress(),
      await baseSetup.logger.getAddress()
    );
    fluidWithdrawContract = await deploy(
      'FluidWithdraw',
      signer,
      await baseSetup.contractRegistry.getAddress(),
      await baseSetup.logger.getAddress()
    );

    fUSDC = await ethers.getContractAt('IFluidLending', FLUID_USDC_ADDRESS);
    fUSDT = await ethers.getContractAt('IFluidLending', FLUID_USDT_ADDRESS);

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

  describe('Fluid Supply', () => {
    it('Should deposit USDC', async () => {
      const supplyAmount = ethers.parseUnits('2000', tokenConfig.USDC.decimals);
      await fundAccountWithToken(safeAddr, 'USDC', 2000);

      const initialUSDCBalance = await USDC.balanceOf(safeAddr);
      const initialFluidBalance = await fUSDC.balanceOf(safeAddr);

      const supplyTxPayload = new FluidSupplyAction(
        FLUID_USDC_ADDRESS,
        supplyAmount.toString()
      ).encodeArgsForExecuteActionCall(42);
      await executeSafeTransaction(
        safeAddr,
        await fluidSupplyContract.getAddress(),
        0,
        supplyTxPayload,
        1,
        signer
      );

      const finalUSDCBalance = await USDC.balanceOf(safeAddr);
      const finalfTokenBalance = await fUSDC.balanceOf(safeAddr);

      expect(finalUSDCBalance).to.equal(initialUSDCBalance - supplyAmount);
      expect(finalfTokenBalance).to.be.greaterThan(initialFluidBalance);
    });
    it('Should deposit USDT', async () => {
      const supplyAmount = ethers.parseUnits('2000', tokenConfig.USDT.decimals);
      await fundAccountWithToken(safeAddr, 'USDT', 2000);

      const initialUSDTBalance = await USDT.balanceOf(safeAddr);
      const initialFluidBalance = await fUSDT.balanceOf(safeAddr);

      log('Supplying USDT');
      log(initialUSDTBalance);
      log(initialFluidBalance);

      const supplyTxPayload = new FluidSupplyAction(
        FLUID_USDT_ADDRESS,
        supplyAmount.toString()
      ).encodeArgsForExecuteActionCall(42);

      await executeSafeTransaction(
        safeAddr,
        await fluidSupplyContract.getAddress(),
        0,
        supplyTxPayload,
        1,
        signer
      );

      const finalUSDTBalance = await USDT.balanceOf(safeAddr);
      const finalfTokenBalance = await fUSDT.balanceOf(safeAddr);

      expect(finalUSDTBalance).to.equal(initialUSDTBalance - supplyAmount);
      expect(finalfTokenBalance).to.be.greaterThan(initialFluidBalance);
    });
    it('Should emit the correct log on deposit', async () => {
      await fundAccountWithToken(safeAddr, 'fUSDC', 100);
      const withdrawAmount = ethers.parseUnits('100', tokenConfig.fUSDC.decimals);
    });
    it('Should adjust incoming values based on param mapping', async () => {
      await fundAccountWithToken(safeAddr, 'fUSDC', 100);
      const withdrawAmount = ethers.parseUnits('100', tokenConfig.fUSDC.decimals);
    });
    it('Should reject invalid token', async () => {
      await fundAccountWithToken(safeAddr, 'fUSDC', 100);
      const withdrawAmount = ethers.parseUnits('100', tokenConfig.fUSDC.decimals);
    });
  });

  describe('Fluid Withdraw', () => {
    it('Should withdraw USDC', async () => {
      await fundAccountWithToken(safeAddr, 'fUSDC', 100);
      const withdrawAmount = ethers.parseUnits('100', tokenConfig.fUSDC.decimals);

      const initialUSDCBalance = await USDC.balanceOf(safeAddr);
      const initialfUSDCBalance = await fUSDC.balanceOf(safeAddr);

      const fluidWithdrawAction = new FluidWithdrawAction(
        FLUID_USDC_ADDRESS,
        withdrawAmount.toString()
      );
      const withdrawTxPayload = await fluidWithdrawAction.encodeArgsForExecuteActionCall(42);

      await executeSafeTransaction(
        safeAddr,
        await fluidWithdrawContract.getAddress(),
        0,
        withdrawTxPayload,
        1,
        signer
      );

      const finalUSDCBalance = await USDC.balanceOf(safeAddr);
      const finalfUSDCBalance = await fUSDC.balanceOf(safeAddr);
      expect(finalUSDCBalance).to.equal(initialUSDCBalance + withdrawAmount);
      expect(finalfUSDCBalance).to.be.lessThan(initialfUSDCBalance);
    });

    it('Should withdraw USDT', async () => {
      await fundAccountWithToken(safeAddr, 'fUSDT', 100);
      const withdrawAmount = ethers.parseUnits('100', tokenConfig.fUSDT.decimals);
    });
    it('Should reject invalid token', async () => {
      await fundAccountWithToken(safeAddr, 'fUSDC', 100);
      const withdrawAmount = ethers.parseUnits('100', tokenConfig.fUSDC.decimals);
    });
    it('Should use the exit function to withdraw', async () => {
      await fundAccountWithToken(safeAddr, 'fUSDC', 100);
      const withdrawAmount = ethers.parseUnits('100', tokenConfig.fUSDC.decimals);
    });
    it('Should withdraw the maximum amount of fUSDC', async () => {
      await fundAccountWithToken(safeAddr, 'fUSDC', 100);
      const withdrawAmount = ethers.MaxUint256;
      const fluidWithdrawAction = new FluidWithdrawAction(
        FLUID_USDC_ADDRESS,
        withdrawAmount.toString()
      );
      const withdrawTxPayload = await fluidWithdrawAction.encodeArgsForExecuteActionCall(42);
      await executeSafeTransaction(
        safeAddr,
        await fluidWithdrawContract.getAddress(),
        0,
        withdrawTxPayload,
        1,
        signer
      );
    });

    it('Should emit the correct log on withdraw', async () => {
      await fundAccountWithToken(safeAddr, 'fUSDC', 100);
      const withdrawAmount = ethers.parseUnits('100', tokenConfig.fUSDC.decimals);
    });
    it('Should adjust incoming values based on param mapping', async () => {
      await fundAccountWithToken(safeAddr, 'fUSDC', 100);
      const withdrawAmount = ethers.parseUnits('100', tokenConfig.fUSDC.decimals);
    });
  });
});

export {};
