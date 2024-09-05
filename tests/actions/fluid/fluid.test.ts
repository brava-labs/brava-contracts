import { expect, ethers, Signer } from '../..';
import { hardhatArguments, network } from 'hardhat';
import {
  executeSafeTransaction,
  FluidSupplyAction,
  FluidWithdrawAction,
  Sequence,
} from 'athena-sdk';
import {
  IERC20,
  FluidSupply,
  FluidWithdraw,
  IFluidLending,
  Logger,
} from '../../../typechain-types';
import { deploy, getBaseSetup, log, decodeLoggerLog, BalanceUpdateLog } from '../../utils';
import { fundAccountWithToken, getUSDC, getUSDT } from '../../utils-stable';
import { tokenConfig } from '../../../tests/constants';
import { FluidSupplyParams } from '../../params';
import { BytesLike } from 'ethers';

describe('Fluid tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let loggerAddress: string;
  let logger: Logger;
  let snapshotId: string;
  let USDC: IERC20;
  let USDT: IERC20;
  let fluidSupplyContract: FluidSupply;
  let fluidWithdrawContract: FluidWithdraw;
  let fUSDC: IFluidLending;
  let fUSDT: IFluidLending;
  const FLUID_USDC_ADDRESS = tokenConfig.fUSDC.address;
  const FLUID_USDT_ADDRESS = tokenConfig.fUSDT.address;

  before(async () => {
    [signer] = await ethers.getSigners();
    const baseSetup = await getBaseSetup();
    safeAddr = baseSetup.safeAddr;
    loggerAddress = await baseSetup.logger.getAddress();
    logger = await ethers.getContractAt('Logger', loggerAddress);
    // Fetch the USDC token
    USDC = await getUSDC();
    USDT = await getUSDT();

    // Initialize FluidSupply and FluidWithdraw actions
    fluidSupplyContract = await deploy(
      'FluidSupply',
      signer,
      await baseSetup.contractRegistry.getAddress(),
      loggerAddress
    );
    fluidWithdrawContract = await deploy(
      'FluidWithdraw',
      signer,
      await baseSetup.contractRegistry.getAddress(),
      loggerAddress
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
      await fundAccountWithToken(safeAddr, 'USDC', supplyAmount);

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
      const supplyAmount = ethers.parseUnits('2000', tokenConfig.USDC.decimals);
      await fundAccountWithToken(safeAddr, 'USDC', supplyAmount);
      const strategyId: number = 42;
      const poolId: BytesLike = ethers.keccak256(FLUID_USDC_ADDRESS).slice(0, 10);
      const supplyTxPayload = new FluidSupplyAction(
        FLUID_USDC_ADDRESS,
        supplyAmount.toString()
      ).encodeArgsForExecuteActionCall(strategyId);
      const tx = await executeSafeTransaction(
        safeAddr,
        await fluidSupplyContract.getAddress(),
        0,
        supplyTxPayload,
        1,
        signer
      );

      const logs = await decodeLoggerLog(tx, loggerAddress);
      log('Logs:', logs);

      // we should expect 1 log, with the correct args
      expect(logs).to.have.length(1);
      expect(logs[0]).to.have.property('eventName', 'BalanceUpdate');

      // we know it's a BalanceUpdateLog because of the eventName
      // now we can typecast and check specific properties
      const txLog = logs[0] as BalanceUpdateLog;
      expect(txLog).to.have.property('safeAddress', safeAddr);
      expect(txLog).to.have.property('strategyId', BigInt(strategyId));
      expect(txLog).to.have.property('poolId', poolId);
      expect(txLog).to.have.property('balanceBefore', BigInt(0));
      expect(txLog).to.have.property('balanceAfter');
      expect(txLog.balanceAfter).to.be.a('bigint');
      expect(txLog.balanceAfter).to.not.equal(BigInt(0));
    });

    it('Should adjust incoming values based on param mapping', async () => {
      const supplyAmount = ethers.parseUnits('1000', tokenConfig.USDC.decimals);
      const fluidSupplyContractAddress = await fluidSupplyContract.getAddress();
      await fundAccountWithToken(fluidSupplyContractAddress, 'USDC', supplyAmount);

      const initialUSDCBalance = await USDC.balanceOf(fluidSupplyContractAddress);
      const initialfUSDCBalance = await fUSDC.balanceOf(fluidSupplyContractAddress);

      const params = {
        token: FLUID_USDC_ADDRESS,
        amount: supplyAmount,
      };

      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const paramsEncoded = abiCoder.encode([FluidSupplyParams], [params]);
      const halfSupplyAmount = ethers.parseUnits('500', tokenConfig.USDC.decimals);
      const bytesHalfSupplyAmount = ethers.zeroPadValue(ethers.toBeHex(halfSupplyAmount), 32);

      // We're calling the action contract directly so make custom param mapping easier
      await fluidSupplyContract.executeAction(paramsEncoded, [0, 1], [bytesHalfSupplyAmount], 42);

      const finalUSDCBalance = await USDC.balanceOf(fluidSupplyContractAddress);
      const finalfUSDCBalance = await fUSDC.balanceOf(fluidSupplyContractAddress);

      expect(finalUSDCBalance).to.equal(initialUSDCBalance - halfSupplyAmount);
      expect(finalfUSDCBalance).to.be.greaterThan(initialfUSDCBalance);
    });

    it.skip('Should reject invalid token', async () => {
      // Currently there is no guard against supplying a non-fToken that implements IFluidLending
      // So this test could pass even if the token is not a valid fToken
      // This test should be updated when we have a guard against supplying a non-fToken
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

      const initialUSDTBalance = await USDT.balanceOf(safeAddr);
      const initialfUSDTBalance = await fUSDT.balanceOf(safeAddr);

      const fluidWithdrawAction = new FluidWithdrawAction(
        FLUID_USDT_ADDRESS,
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

      const finalUSDTBalance = await USDT.balanceOf(safeAddr);
      const finalfUSDTBalance = await fUSDT.balanceOf(safeAddr);
      expect(finalUSDTBalance).to.equal(initialUSDTBalance + withdrawAmount);
      expect(finalfUSDTBalance).to.be.lessThan(initialfUSDTBalance);
    });
    it('Should emit the correct log on withdraw', async () => {
      await fundAccountWithToken(safeAddr, 'fUSDC', 100);
      const withdrawAmount = ethers.parseUnits('100', tokenConfig.fUSDC.decimals);
      const strategyId: number = 42;
      const poolId: BytesLike = ethers.keccak256(FLUID_USDC_ADDRESS).slice(0, 10);
      const withdrawTxPayload = new FluidWithdrawAction(
        FLUID_USDC_ADDRESS,
        withdrawAmount.toString()
      ).encodeArgsForExecuteActionCall(strategyId);

      const tx = await executeSafeTransaction(
        safeAddr,
        await fluidWithdrawContract.getAddress(),
        0,
        withdrawTxPayload,
        1,
        signer
      );

      const logs = await decodeLoggerLog(tx, loggerAddress);
      log('Logs:', logs);

      // we should expect 1 log, with the correct args
      expect(logs).to.have.length(1);
      expect(logs[0]).to.have.property('eventName', 'BalanceUpdate');

      // we know it's a BalanceUpdateLog because of the eventName
      // now we can typecast and check specific properties
      const txLog = logs[0] as BalanceUpdateLog;
      expect(txLog).to.have.property('safeAddress', safeAddr);
      expect(txLog).to.have.property('strategyId', BigInt(strategyId));
      expect(txLog).to.have.property('poolId', poolId);
      expect(txLog).to.have.property('balanceBefore', withdrawAmount);
      expect(txLog).to.have.property('balanceAfter');
      expect(txLog.balanceAfter).to.be.a('bigint');
      expect(txLog.balanceAfter).to.not.equal(BigInt(0));
    });
    it.skip('Should adjust incoming values based on param mapping', async () => {
      await fundAccountWithToken(safeAddr, 'fUSDC', 100);
      const withdrawAmount = ethers.parseUnits('100', tokenConfig.fUSDC.decimals);
    });

    it.skip('Should use the exit function to withdraw', async () => {
      await fundAccountWithToken(safeAddr, 'fUSDC', 100);
      const withdrawAmount = ethers.parseUnits('100', tokenConfig.fUSDC.decimals);
    });
    it.skip('Should withdraw the maximum amount of fUSDC', async () => {
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
    it.skip('Should reject invalid token', async () => {
      // Currently there is no guard against supplying a non-fToken that implements IFluidLending
      // So this test could pass even if the token is not a valid fToken
      // This test should be updated when we have a guard against supplying a non-fToken
    });
  });
});

export {};
