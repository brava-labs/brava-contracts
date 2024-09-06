import { expect, ethers, Signer } from '../..';
import { hardhatArguments, network } from 'hardhat';
import { executeSafeTransaction, YearnSupplyAction, YearnWithdrawAction } from 'athena-sdk';
import { IERC20, YearnSupply, YearnWithdraw, IYearnVault, Logger } from '../../../typechain-types';
import { deploy, getBaseSetup, log, decodeLoggerLog, BalanceUpdateLog } from '../../utils';
import { fundAccountWithToken, getUSDC } from '../../utils-stable';
import { tokenConfig, YEARN_REGISTRY_ADDRESS } from '../../constants';
import { YearnSupplyParams } from '../../params';
import { BytesLike } from 'ethers';

describe.only('Yearn tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let loggerAddress: string;
  let logger: Logger;
  let snapshotId: string;
  let USDC: IERC20;
  let yearnSupplyContract: YearnSupply;
  let yearnWithdrawContract: YearnWithdraw;
  let yUSDC: IYearnVault;

  before(async () => {
    [signer] = await ethers.getSigners();
    const baseSetup = await getBaseSetup();
    safeAddr = baseSetup.safeAddr;
    loggerAddress = await baseSetup.logger.getAddress();
    logger = await ethers.getContractAt('Logger', loggerAddress);
    // Fetch the USDC token
    USDC = await getUSDC();

    // Initialize YearnSupply and YearnWithdraw actions
    yearnSupplyContract = await deploy(
      'YearnSupply',
      signer,
      await baseSetup.contractRegistry.getAddress(),
      loggerAddress
    );
    yearnWithdrawContract = await deploy(
      'YearnWithdraw',
      signer,
      await baseSetup.contractRegistry.getAddress(),
      loggerAddress
    );

    const yearnRegistry = await ethers.getContractAt('IYearnRegistry', YEARN_REGISTRY_ADDRESS);
    const yUSDCAddress = await yearnRegistry.latestVault(tokenConfig.USDC.address);
    yUSDC = await ethers.getContractAt('IYearnVault', yUSDCAddress);

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

  describe('Yearn Supply', () => {
    it('Should deposit USDC', async () => {
      const supplyAmount = ethers.parseUnits('2000', tokenConfig.USDC.decimals);
      await fundAccountWithToken(safeAddr, 'USDC', supplyAmount);

      const initialUSDCBalance = await USDC.balanceOf(safeAddr);
      const initialYearnBalance = await yUSDC.balanceOf(safeAddr);

      const supplyTxPayload = new YearnSupplyAction(
        await yUSDC.getAddress(),
        supplyAmount.toString()
      ).encodeArgsForExecuteActionCall(42);
      await executeSafeTransaction(
        safeAddr,
        await yearnSupplyContract.getAddress(),
        0,
        supplyTxPayload,
        1,
        signer
      );

      const finalUSDCBalance = await USDC.balanceOf(safeAddr);
      const finalYearnBalance = await yUSDC.balanceOf(safeAddr);

      expect(finalUSDCBalance).to.equal(initialUSDCBalance - supplyAmount);
      expect(finalYearnBalance).to.be.greaterThan(initialYearnBalance);
    });

    it('Should emit the correct log on deposit', async () => {
      const supplyAmount = ethers.parseUnits('2000', tokenConfig.USDC.decimals);
      await fundAccountWithToken(safeAddr, 'USDC', supplyAmount);
      const strategyId: number = 42;
      const poolId: BytesLike = ethers.keccak256(await yUSDC.getAddress()).slice(0, 10);
      const supplyTxPayload = new YearnSupplyAction(
        await yUSDC.getAddress(),
        supplyAmount.toString()
      ).encodeArgsForExecuteActionCall(strategyId);
      const tx = await executeSafeTransaction(
        safeAddr,
        await yearnSupplyContract.getAddress(),
        0,
        supplyTxPayload,
        1,
        signer
      );

      const logs = await decodeLoggerLog(tx, loggerAddress);
      log('Logs:', logs);

      expect(logs).to.have.length(1);
      expect(logs[0]).to.have.property('eventName', 'BalanceUpdate');

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
      const yearnSupplyContractAddress = await yearnSupplyContract.getAddress();
      await fundAccountWithToken(yearnSupplyContractAddress, 'USDC', supplyAmount);

      const initialUSDCBalance = await USDC.balanceOf(yearnSupplyContractAddress);
      const initialYearnBalance = await yUSDC.balanceOf(yearnSupplyContractAddress);

      const params = {
        token: await yUSDC.getAddress(),
        amount: supplyAmount,
      };

      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const paramsEncoded = abiCoder.encode([YearnSupplyParams], [params]);
      const halfSupplyAmount = ethers.parseUnits('500', tokenConfig.USDC.decimals);
      const bytesHalfSupplyAmount = ethers.zeroPadValue(ethers.toBeHex(halfSupplyAmount), 32);

      await yearnSupplyContract.executeAction(paramsEncoded, [0, 1], [bytesHalfSupplyAmount], 42);

      const finalUSDCBalance = await USDC.balanceOf(yearnSupplyContractAddress);
      const finalYearnBalance = await yUSDC.balanceOf(yearnSupplyContractAddress);

      expect(finalUSDCBalance).to.equal(initialUSDCBalance - halfSupplyAmount);
      expect(finalYearnBalance).to.be.greaterThan(initialYearnBalance);
    });
  });

  describe('Yearn Withdraw', () => {
    it('Should withdraw USDC', async () => {
      await fundAccountWithToken(safeAddr, 'yUSDC', 100);
      const withdrawAmount = ethers.parseUnits('100', await yUSDC.decimals());

      const initialUSDCBalance = await USDC.balanceOf(safeAddr);
      const initialYearnBalance = await yUSDC.balanceOf(safeAddr);

      const yearnWithdrawAction = new YearnWithdrawAction(
        await yUSDC.getAddress(),
        withdrawAmount.toString()
      );
      const withdrawTxPayload = await yearnWithdrawAction.encodeArgsForExecuteActionCall(42);

      await executeSafeTransaction(
        safeAddr,
        await yearnWithdrawContract.getAddress(),
        0,
        withdrawTxPayload,
        1,
        signer
      );

      const finalUSDCBalance = await USDC.balanceOf(safeAddr);
      const finalYearnBalance = await yUSDC.balanceOf(safeAddr);
      expect(finalUSDCBalance).to.be.greaterThan(initialUSDCBalance);
      expect(finalYearnBalance).to.be.lessThan(initialYearnBalance);
    });

    it('Should emit the correct log on withdraw', async () => {
      await fundAccountWithToken(safeAddr, 'yUSDC', 100);
      const withdrawAmount = ethers.parseUnits('100', await yUSDC.decimals());
      const strategyId: number = 42;
      const poolId: BytesLike = ethers.keccak256(await yUSDC.getAddress()).slice(0, 10);
      const withdrawTxPayload = new YearnWithdrawAction(
        await yUSDC.getAddress(),
        withdrawAmount.toString()
      ).encodeArgsForExecuteActionCall(strategyId);

      const tx = await executeSafeTransaction(
        safeAddr,
        await yearnWithdrawContract.getAddress(),
        0,
        withdrawTxPayload,
        1,
        signer
      );

      const logs = await decodeLoggerLog(tx, loggerAddress);
      log('Logs:', logs);

      expect(logs).to.have.length(1);
      expect(logs[0]).to.have.property('eventName', 'BalanceUpdate');

      const txLog = logs[0] as BalanceUpdateLog;
      expect(txLog).to.have.property('safeAddress', safeAddr);
      expect(txLog).to.have.property('strategyId', BigInt(strategyId));
      expect(txLog).to.have.property('poolId', poolId);
      expect(txLog).to.have.property('balanceBefore', withdrawAmount);
      expect(txLog).to.have.property('balanceAfter');
      expect(txLog.balanceAfter).to.be.a('bigint');
      expect(txLog.balanceAfter).to.not.equal(BigInt(0));
    });

    it('Should adjust incoming values based on param mapping', async () => {
      const withdrawAmount = ethers.parseUnits('1000', await yUSDC.decimals());
      const yearnWithdrawContractAddress = await yearnWithdrawContract.getAddress();
      await fundAccountWithToken(yearnWithdrawContractAddress, 'yUSDC', withdrawAmount);

      const initialUSDCBalance = await USDC.balanceOf(yearnWithdrawContractAddress);
      const initialYearnBalance = await yUSDC.balanceOf(yearnWithdrawContractAddress);

      const params = {
        token: await yUSDC.getAddress(),
        amount: withdrawAmount,
      };

      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const paramsEncoded = abiCoder.encode([YearnSupplyParams], [params]);
      const halfWithdrawAmount = ethers.parseUnits('500', await yUSDC.decimals());
      const bytesHalfWithdrawAmount = ethers.zeroPadValue(ethers.toBeHex(halfWithdrawAmount), 32);

      await yearnWithdrawContract.executeAction(
        paramsEncoded,
        [0, 1],
        [bytesHalfWithdrawAmount],
        42
      );

      const finalUSDCBalance = await USDC.balanceOf(yearnWithdrawContractAddress);
      const finalYearnBalance = await yUSDC.balanceOf(yearnWithdrawContractAddress);

      expect(finalYearnBalance).to.be.lessThan(initialYearnBalance);
      expect(finalUSDCBalance).to.be.greaterThan(initialUSDCBalance);
    });

    it('Should use the exit function to withdraw', async () => {
      const yearnWithdrawContractAddress = await yearnWithdrawContract.getAddress();
      await fundAccountWithToken(yearnWithdrawContractAddress, 'yUSDC', 100);
      const withdrawAmount = ethers.parseUnits('100', await yUSDC.decimals());

      await yearnWithdrawContract.exit(await yUSDC.getAddress());
      expect(await yUSDC.balanceOf(yearnWithdrawContractAddress)).to.be.equal(BigInt(0));
    });

    it('Should withdraw the maximum amount of yUSDC', async () => {
      await fundAccountWithToken(safeAddr, 'yUSDC', 100);
      const withdrawAmount = ethers.MaxUint256;
      const yearnWithdrawAction = new YearnWithdrawAction(
        await yUSDC.getAddress(),
        withdrawAmount.toString()
      );
      const withdrawTxPayload = await yearnWithdrawAction.encodeArgsForExecuteActionCall(42);
      await executeSafeTransaction(
        safeAddr,
        await yearnWithdrawContract.getAddress(),
        0,
        withdrawTxPayload,
        1,
        signer
      );
    });
  });
});

export {};
