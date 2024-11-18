import { BytesLike } from 'ethers';
import { network } from 'hardhat';
import { ethers, expect, Signer } from '../..';
import { actionTypes } from '../../../tests/actions';
import { tokenConfig } from '../../../tests/constants';
import {
    AdminVault,
    IERC20,
    Logger,
    SparkSupply,
    SparkWithdraw,
} from '../../../typechain-types';
import { ACTION_LOG_IDS, BalanceUpdateLog } from '../../logs';
import {
    calculateExpectedFee,
    decodeLoggerLog,
    deploy,
    executeAction,
    getBaseSetup,
    log,
} from '../../utils';
import { fundAccountWithToken, getDAI } from '../../utils-stable';

describe('Spark tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let loggerAddress: string;
  let logger: Logger;
  let snapshotId: string;
  let DAI: IERC20;
  let sparkSupplyContract: SparkSupply;
  let sparkWithdrawContract: SparkWithdraw;
  let sparkSupplyAddress: string;
  let sparkWithdrawAddress: string;
  let sDAI: IERC20;
  let adminVault: AdminVault;
  const SPARK_DAI_ADDRESS = tokenConfig.sDAI.address;

  before(async () => {
    [signer] = await ethers.getSigners();
    const baseSetup = await getBaseSetup(signer);
    if (!baseSetup) {
      throw new Error('Base setup not deployed');
    }
    safeAddr = (await baseSetup.safe.getAddress()) as string;
    loggerAddress = (await baseSetup.logger.getAddress()) as string;
    logger = await ethers.getContractAt('Logger', loggerAddress);
    adminVault = await baseSetup.adminVault;
    
    DAI = await getDAI();

    sparkSupplyContract = await deploy(
      'SparkSupply',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    sparkWithdrawContract = await deploy(
      'SparkWithdraw',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    sparkSupplyAddress = await sparkSupplyContract.getAddress();
    sparkWithdrawAddress = await sparkWithdrawContract.getAddress();
    sDAI = await ethers.getContractAt('IERC20', SPARK_DAI_ADDRESS);

    await adminVault.proposePool('Spark', SPARK_DAI_ADDRESS);
    await adminVault.addPool('Spark', SPARK_DAI_ADDRESS);
  });

  beforeEach(async () => {
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    await network.provider.send('evm_revert', [snapshotId]);
  });

  describe('Spark Supply', () => {
    it('Should deposit DAI', async () => {
      const supplyAmount = ethers.parseUnits('2000', tokenConfig.DAI.decimals);
      await fundAccountWithToken(safeAddr, 'DAI', supplyAmount);

      const initialDAIBalance = await DAI.balanceOf(safeAddr);
      const initialSparkBalance = await sDAI.balanceOf(safeAddr);

      await executeAction({
        type: 'SparkSupply',
        amount: supplyAmount,
      });

      const finalDAIBalance = await DAI.balanceOf(safeAddr);
      const finalsTokenBalance = await sDAI.balanceOf(safeAddr);

      expect(finalDAIBalance).to.equal(initialDAIBalance - supplyAmount);
      expect(finalsTokenBalance).to.be.greaterThan(initialSparkBalance);
    });

    it('Should deposit max', async () => {
      const amount = ethers.parseUnits('2000', tokenConfig.DAI.decimals);
      await fundAccountWithToken(safeAddr, 'DAI', amount);

      expect(await DAI.balanceOf(safeAddr)).to.equal(amount);

      await executeAction({
        type: 'SparkSupply',
        amount: ethers.MaxUint256,
      });

      expect(await DAI.balanceOf(safeAddr)).to.equal(0);
      expect(await sDAI.balanceOf(safeAddr)).to.be.greaterThan(0);
    });

    it('Should emit the correct log on deposit', async () => {
      const amount = ethers.parseUnits('2000', tokenConfig.DAI.decimals);
      await fundAccountWithToken(safeAddr, 'DAI', amount);
      const strategyId: number = 42;
      const poolId: BytesLike = ethers.keccak256(SPARK_DAI_ADDRESS).slice(0, 10);

      const tx = await executeAction({
        type: 'SparkSupply',
        amount,
      });

      const logs = await decodeLoggerLog(tx);
      log('Logs:', logs);

      expect(logs).to.have.length(1);
      expect(logs[0]).to.have.property('eventId', BigInt(ACTION_LOG_IDS.BALANCE_UPDATE));

      const txLog = logs[0] as BalanceUpdateLog;
      expect(txLog).to.have.property('safeAddress', safeAddr);
      expect(txLog).to.have.property('strategyId', BigInt(strategyId));
      expect(txLog).to.have.property('poolId', poolId);
      expect(txLog).to.have.property('balanceBefore', BigInt(0));
      expect(txLog).to.have.property('balanceAfter');
      expect(txLog).to.have.property('feeInTokens');
      expect(txLog.balanceAfter).to.be.a('bigint');
      expect(txLog.balanceAfter).to.not.equal(BigInt(0));
    });

    it('Should have deposit action type', async () => {
      const actionType = await sparkSupplyContract.actionType();
      expect(actionType).to.equal(actionTypes.DEPOSIT_ACTION);
    });

    it('Should initialize last fee timestamp', async () => {
      const initialLastFeeTimestamp = await adminVault.lastFeeTimestamp(
        safeAddr,
        SPARK_DAI_ADDRESS
      );
      expect(initialLastFeeTimestamp).to.equal(BigInt(0));

      await fundAccountWithToken(safeAddr, 'DAI', 1000);

      const tx = await executeAction({
        type: 'SparkSupply',
      });

      const txReceipt = await tx.wait();
      if (!txReceipt) {
        throw new Error('Transaction receipt not found');
      }
      const block = await ethers.provider.getBlock(txReceipt.blockNumber);
      if (!block) {
        throw new Error('Block not found');
      }
      const finalLastFeeTimestamp = await adminVault.lastFeeTimestamp(safeAddr, SPARK_DAI_ADDRESS);
      expect(finalLastFeeTimestamp).to.equal(BigInt(block.timestamp));
    });

    it('Should reject invalid token', async () => {
      await expect(
        executeAction({
          type: 'SparkSupply',
          poolAddress: '0x0000000000000000000000000000000000000000',
        })
      ).to.be.revertedWith('GS013');
    });
  });

  describe('Spark Withdraw', () => {
    beforeEach(async () => {
      await executeAction({
        type: 'SparkSupply',
      });
    });

    it('Should withdraw DAI', async () => {
      const amount = ethers.parseUnits('100', tokenConfig.sDAI.decimals);
      await fundAccountWithToken(safeAddr, 'sDAI', amount);

      const initialDAIBalance = await DAI.balanceOf(safeAddr);
      const initialsDAIBalance = await sDAI.balanceOf(safeAddr);

      const tx = await executeAction({
        type: 'SparkWithdraw',
        amount,
      });

      const finalDAIBalance = await DAI.balanceOf(safeAddr);
      const finalsDAIBalance = await sDAI.balanceOf(safeAddr);
      expect(finalDAIBalance).to.equal(initialDAIBalance + amount);
      expect(finalsDAIBalance).to.be.lessThan(initialsDAIBalance);
    });

    it('Should emit the correct log on withdraw', async () => {
      const amount = ethers.parseUnits('100', tokenConfig.DAI.decimals);
      await fundAccountWithToken(safeAddr, 'sDAI', amount);
      const strategyId: number = 42;
      const poolId: BytesLike = ethers.keccak256(SPARK_DAI_ADDRESS).slice(0, 10);

      const tx = await executeAction({
        type: 'SparkWithdraw',
        amount,
      });

      const logs = await decodeLoggerLog(tx);
      log('Logs:', logs);

      expect(logs).to.have.length(1);
      expect(logs[0]).to.have.property('eventId', BigInt(ACTION_LOG_IDS.BALANCE_UPDATE));

      const txLog = logs[0] as BalanceUpdateLog;
      expect(txLog).to.have.property('safeAddress', safeAddr);
      expect(txLog).to.have.property('strategyId', BigInt(strategyId));
      expect(txLog).to.have.property('poolId', poolId);
      expect(txLog).to.have.property('balanceBefore', amount);
      expect(txLog).to.have.property('balanceAfter');
      expect(txLog).to.have.property('feeInTokens');
      expect(txLog.balanceAfter).to.be.a('bigint');
      expect(txLog.balanceAfter).to.be.lessThan(amount);
    });

    it('Should withdraw the maximum amount', async () => {
      const amount = ethers.parseUnits('100', tokenConfig.DAI.decimals);
      await fundAccountWithToken(safeAddr, 'sDAI', amount);

      expect(await sDAI.balanceOf(safeAddr)).to.equal(amount);
      expect(await DAI.balanceOf(safeAddr)).to.equal(0);

      await executeAction({
        type: 'SparkWithdraw',
        amount: ethers.MaxUint256,
      });

      expect(await sDAI.balanceOf(safeAddr)).to.equal(0);
      expect(await DAI.balanceOf(safeAddr)).to.be.greaterThan(0);
    });

    it('Should take fees', async () => {
      const amount = ethers.parseUnits('100', tokenConfig.DAI.decimals);
      await fundAccountWithToken(safeAddr, 'DAI', amount);

      const feeConfig = await adminVault.feeConfig();
      const feeRecipient = feeConfig.recipient;
      const feeRecipientDAIBalanceBefore = await DAI.balanceOf(feeRecipient);
      const feeRecipientsDAIBalanceBefore = await sDAI.balanceOf(feeRecipient);

      const supplyTx = await executeAction({
        type: 'SparkSupply',
        amount,
        feeBasis: 10,
      });

      const sDAIBalanceAfterSupply = await sDAI.balanceOf(safeAddr);

      const initialFeeTimestamp = await adminVault.lastFeeTimestamp(safeAddr, SPARK_DAI_ADDRESS);
      const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);

      await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

      const withdrawTx = await executeAction({
        type: 'SparkWithdraw',
        feeBasis: 10,
        amount: '1',
      });

      const expectedFee = await calculateExpectedFee(
        (await supplyTx.wait()) ?? (() => { throw new Error('Supply transaction failed'); })(),
        (await withdrawTx.wait()) ?? (() => { throw new Error('Withdraw transaction failed'); })(),
        10,
        sDAIBalanceAfterSupply
      );
      const expectedFeeRecipientBalance = feeRecipientsDAIBalanceBefore + expectedFee;

      expect(await DAI.balanceOf(feeRecipient)).to.equal(feeRecipientDAIBalanceBefore);
      expect(await sDAI.balanceOf(feeRecipient)).to.equal(expectedFeeRecipientBalance);
    });

    it('Should have withdraw action type', async () => {
      const actionType = await sparkWithdrawContract.actionType();
      expect(actionType).to.equal(actionTypes.WITHDRAW_ACTION);
    });

    it('Should reject invalid token', async () => {
      await expect(
        executeAction({
          type: 'SparkWithdraw',
          poolAddress: '0x0000000000000000000000000000000000000000',
        })
      ).to.be.revertedWith('GS013');
    });
  });
});

export { };
