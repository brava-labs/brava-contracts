import { BytesLike } from 'ethers';
import { network } from 'hardhat';
import { ethers, expect, Signer } from '../..';
import { actionTypes } from '../../actions';
import { tokenConfig } from '../../constants';
import { AdminVault, IERC20, Logger, SparkV1Supply, SparkV1Withdraw } from '../../../typechain-types';
import { ACTION_LOG_IDS, BalanceUpdateLog } from '../../logs';
import {
  calculateExpectedFee,
  decodeLoggerLog,
  deploy,
  executeAction,
  getBaseSetup,
  log,
} from '../../utils';
import { fundAccountWithToken, getDAI, getUSDS } from '../../utils-stable';

describe('Spark tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let loggerAddress: string;
  let logger: Logger;
  let snapshotId: string;
  let DAI: IERC20;
  let USDS: IERC20;
  let sparkSupplyContract: SparkV1Supply;
  let sparkWithdrawContract: SparkV1Withdraw;
  let sparkSupplyAddress: string;
  let sparkWithdrawAddress: string;
  let sparkDAI: IERC20;
  let sparkUSDS: IERC20;
  let adminVault: AdminVault;
  const SPARK_DAI_ADDRESS = tokenConfig.SPARK_V1_DAI.address;
  const SPARK_USDS_ADDRESS = tokenConfig.SPARK_V1_USDS.address;
  const protocolId = BigInt(
    ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['string'], ['SparkV1']))
  );

  const testCases: Array<{
    token: keyof typeof tokenConfig;
    poolAddress: string;
    mToken: () => IERC20;
  }> = [
    {
      token: 'DAI',
      poolAddress: SPARK_DAI_ADDRESS,
      mToken: () => sparkDAI,
    },
    {
      token: 'USDS',
      poolAddress: SPARK_USDS_ADDRESS,
      mToken: () => sparkUSDS,
    },
    // Add more tokens here as needed
  ];

  const getTokenNameFromAddress = (address: string): string => {
    return (
      Object.entries(tokenConfig).find(
        ([_, config]) => config.address.toLowerCase() === address.toLowerCase()
      )?.[0] ?? address
    );
  };

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
    USDS = await getUSDS();

    sparkSupplyContract = await deploy(
      'SparkV1Supply',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    sparkWithdrawContract = await deploy(
      'SparkV1Withdraw',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    sparkSupplyAddress = await sparkSupplyContract.getAddress();
    sparkWithdrawAddress = await sparkWithdrawContract.getAddress();
    sparkDAI = await ethers.getContractAt('IERC20', SPARK_DAI_ADDRESS);
    sparkUSDS = await ethers.getContractAt('IERC20', SPARK_USDS_ADDRESS);

    // Add both pools
    await adminVault.proposePool('SparkV1', SPARK_DAI_ADDRESS);
    await adminVault.addPool('SparkV1', SPARK_DAI_ADDRESS);
    await adminVault.proposePool('SparkV1', SPARK_USDS_ADDRESS);
    await adminVault.addPool('SparkV1', SPARK_USDS_ADDRESS);
  });

  beforeEach(async () => {
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    await network.provider.send('evm_revert', [snapshotId]);
  });

  describe('Spark Supply', () => {
    testCases.forEach(({ token, poolAddress, mToken }) => {
      describe(`${getTokenNameFromAddress(poolAddress)} Supply Tests`, () => {
        it('Should deposit', async () => {
          const supplyAmount = ethers.parseUnits('2000', tokenConfig[token].decimals);
          await fundAccountWithToken(safeAddr, token, supplyAmount);

          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialSparkBalance = await mToken().balanceOf(safeAddr);

          await executeAction({
            type: 'SparkV1Supply',
            amount: supplyAmount,
            poolAddress,
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalsTokenBalance = await mToken().balanceOf(safeAddr);

          expect(finalTokenBalance).to.equal(initialTokenBalance - supplyAmount);
          expect(finalsTokenBalance).to.be.greaterThan(initialSparkBalance);
        });

        it('Should deposit max', async () => {
          const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          expect(await tokenContract.balanceOf(safeAddr)).to.equal(amount);

          await executeAction({
            type: 'SparkV1Supply',
            amount: ethers.MaxUint256,
            poolAddress,
          });

          expect(await tokenContract.balanceOf(safeAddr)).to.equal(0);
          expect(await mToken().balanceOf(safeAddr)).to.be.greaterThan(0);
        });
        it('Should take fees on deposit', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          const feeConfig = await adminVault.feeConfig();
          const feeRecipient = feeConfig.recipient;
          const feeRecipientTokenBalanceBefore = await tokenContract.balanceOf(feeRecipient);
          const feeRecipientmTokenBalanceBefore = await mToken().balanceOf(feeRecipient);

          // Do an initial deposit
          const firstTx = await executeAction({
            type: 'SparkV1Supply',
            poolAddress,
            amount,
            feeBasis: 10,
          });

          const mTokenBalanceAfterFirstTx = await mToken().balanceOf(safeAddr);

          // Time travel 1 year
          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
            safeAddr,
            poolAddress
          );
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          // Do another deposit to trigger fees
          const secondTx = await executeAction({
            type: 'SparkV1Supply',
            poolAddress,
            amount: '0',
            feeBasis: 10,
          });

          const firstTxReceipt =
            (await firstTx.wait()) ??
            (() => {
              throw new Error('First deposit transaction failed');
            })();
          const secondTxReceipt =
            (await secondTx.wait()) ??
            (() => {
              throw new Error('Second deposit transaction failed');
            })();

          // Calculate expected fee
          const expectedFee = await calculateExpectedFee(
            firstTxReceipt,
            secondTxReceipt,
            10,
            mTokenBalanceAfterFirstTx
          );
          const expectedFeeRecipientBalance = feeRecipientmTokenBalanceBefore + expectedFee;

          // Check fees were taken in fTokens, not underlying
          expect(await tokenContract.balanceOf(feeRecipient)).to.equal(
            feeRecipientTokenBalanceBefore
          );
          expect(await mToken().balanceOf(feeRecipient)).to.equal(expectedFeeRecipientBalance);
        });
      });
    });

    describe('General tests', () => {
      it('Should emit the correct log on deposit', async () => {
        const token = 'DAI';
        const poolAddress = SPARK_DAI_ADDRESS;

        const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
        await fundAccountWithToken(safeAddr, token, amount);
        const strategyId: number = 42;
        const poolId: BytesLike = ethers.keccak256(poolAddress).slice(0, 10);

        const tx = await executeAction({
          type: 'SparkV1Supply',
          amount,
          poolAddress,
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
      it('Should initialize last fee timestamp', async () => {
        const initialLastFeeTimestamp = await adminVault.lastFeeTimestamp(
          safeAddr,
          SPARK_DAI_ADDRESS
        );
        expect(initialLastFeeTimestamp).to.equal(BigInt(0));

        await fundAccountWithToken(safeAddr, 'DAI', 1000);

        const tx = await executeAction({
          type: 'SparkV1Supply',
          poolAddress: SPARK_DAI_ADDRESS,
        });

        //get the block timestamp of the tx
        const txReceipt = await tx.wait();
        if (!txReceipt) {
          throw new Error('Transaction receipt not found');
        }
        const block = await ethers.provider.getBlock(txReceipt.blockNumber);
        if (!block) {
          throw new Error('Block not found');
        }
        const finalLastFeeTimestamp = await adminVault.lastFeeTimestamp(
          safeAddr,
          SPARK_DAI_ADDRESS
        );
        expect(finalLastFeeTimestamp).to.equal(BigInt(block.timestamp));
      });
      it('Should have deposit action type', async () => {
        const actionType = await sparkSupplyContract.actionType();
        expect(actionType).to.equal(actionTypes.DEPOSIT_ACTION);
      });

      it('Should reject invalid token', async () => {
        await expect(
          executeAction({
            type: 'SparkV1Supply',
            poolAddress: '0x0000000000000000000000000000000000000000',
          })
        ).to.be.revertedWith('GS013');
      });
    });
  });

  describe('Spark Withdraw', () => {
    testCases.forEach(({ token, poolAddress, mToken }) => {
      describe(`${getTokenNameFromAddress(poolAddress)} Withdraw Tests`, () => {
        beforeEach(async () => {
          // Initialize for this specific token
          await executeAction({
            type: 'SparkV1Supply',
            poolAddress,
            amount: '0',
          });
        });

        it('Should withdraw token', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          await fundAccountWithToken(safeAddr, `SPARK_V1_${token}`, amount);

          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialsTokenBalance = await mToken().balanceOf(safeAddr);

          await executeAction({
            type: 'SparkV1Withdraw',
            amount,
            poolAddress,
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalsTokenBalance = await mToken().balanceOf(safeAddr);
          expect(finalTokenBalance).to.equal(initialTokenBalance + amount);
          expect(finalsTokenBalance).to.be.lessThan(initialsTokenBalance);
        });

        it('Should withdraw max', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          await fundAccountWithToken(safeAddr, `SPARK_V1_${token}`, amount);

          expect(await mToken().balanceOf(safeAddr)).to.equal(amount);

          await executeAction({
            type: 'SparkV1Withdraw',
            amount: ethers.MaxUint256,
            poolAddress,
          });

          expect(await mToken().balanceOf(safeAddr)).to.equal(0);
        });
        it('Should take fees on withdraw', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          const feeConfig = await adminVault.feeConfig();
          const feeRecipient = feeConfig.recipient;
          const feeRecipientTokenBalanceBefore = await tokenContract.balanceOf(feeRecipient);
          const feeRecipientmTokenBalanceBefore = await mToken().balanceOf(feeRecipient);

          const supplyTx = await executeAction({
            type: 'SparkV1Supply',
            poolAddress,
            amount,
            feeBasis: 10,
          });

          const mTokenBalanceAfterSupply = await mToken().balanceOf(safeAddr);

          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
            safeAddr,
            poolAddress
          );
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          const withdrawTx = await executeAction({
            type: 'SparkV1Withdraw',
            poolAddress,
            feeBasis: 10,
            amount: '1',
          });

          const expectedFee = await calculateExpectedFee(
            (await supplyTx.wait()) ??
              (() => {
                throw new Error('Supply transaction failed');
              })(),
            (await withdrawTx.wait()) ??
              (() => {
                throw new Error('Withdraw transaction failed');
              })(),
            10,
            mTokenBalanceAfterSupply
          );
          const expectedFeeRecipientBalance = feeRecipientmTokenBalanceBefore + expectedFee;

          expect(await tokenContract.balanceOf(feeRecipient)).to.equal(
            feeRecipientTokenBalanceBefore
          );
          expect(await mToken().balanceOf(feeRecipient)).to.equal(expectedFeeRecipientBalance);
        });
      });
    });

    describe('General tests', () => {
      it('Should emit the correct log on withdraw', async () => {
        const token = 'DAI';
        const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
        await fundAccountWithToken(safeAddr, token, amount);
        const strategyId: number = 42;
        const poolId: BytesLike = ethers.keccak256(SPARK_DAI_ADDRESS).slice(0, 10);

        // // init the fee timestamp and deposit max
        await executeAction({
          type: 'SparkV1Supply',
          poolAddress: SPARK_DAI_ADDRESS,
          amount: ethers.MaxUint256,
          feeBasis: 10,
        });

        // now lets withdraw
        const tx = await executeAction({
          type: 'SparkV1Withdraw',
          amount: ethers.MaxUint256,
          poolAddress: SPARK_DAI_ADDRESS,
        });

        const logs = await decodeLoggerLog(tx);
        log('Logs:', logs);

        // we should expect 1 log, with the correct args
        expect(logs).to.have.length(1);
        expect(logs[0]).to.have.property('eventId', BigInt(ACTION_LOG_IDS.BALANCE_UPDATE));

        // we know it's a BalanceUpdateLog because of the eventName
        // now we can typecast and check specific properties
        const txLog = logs[0] as BalanceUpdateLog;
        expect(txLog).to.have.property('safeAddress', safeAddr);
        expect(txLog).to.have.property('strategyId', BigInt(strategyId));
        expect(txLog).to.have.property('poolId', poolId);
        expect(txLog).to.have.property('balanceBefore');
        expect(txLog).to.have.property('balanceAfter');
        expect(txLog).to.have.property('feeInTokens');
        expect(txLog.balanceBefore).to.be.gt(BigInt(0));
        expect(txLog.balanceAfter).to.be.lt(txLog.balanceBefore);
        expect(txLog.feeInTokens).to.equal(BigInt(0));
      });
      it('Should have withdraw action type', async () => {
        const actionType = await sparkWithdrawContract.actionType();
        expect(actionType).to.equal(actionTypes.WITHDRAW_ACTION);
      });

      it('Should reject invalid token', async () => {
        await expect(
          executeAction({
            type: 'SparkV1Withdraw',
            poolAddress: '0x0000000000000000000000000000000000000000',
          })
        ).to.be.revertedWith('GS013');
      });
    });
  });
});

export {};
