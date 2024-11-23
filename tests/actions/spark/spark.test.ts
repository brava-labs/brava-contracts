import { BytesLike } from 'ethers';
import { network } from 'hardhat';
import { ethers, expect, Signer } from '../..';
import { actionTypes } from '../../../tests/actions';
import { tokenConfig } from '../../../tests/constants';
import { AdminVault, IERC20, Logger, SparkSupply, SparkWithdraw } from '../../../typechain-types';
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
  const protocolId = BigInt(
    ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['string'], ['Spark']))
  );

  const testCases: Array<{
    token: keyof typeof tokenConfig;
    poolAddress: string;
    mToken: () => IERC20;
  }> = [
    {
      token: 'DAI',
      poolAddress: SPARK_DAI_ADDRESS,
      mToken: () => sDAI,
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
    testCases.forEach(({ token, poolAddress, mToken }) => {
      describe(`${getTokenNameFromAddress(poolAddress)} Supply Tests`, () => {
        it('Should deposit', async () => {
          const supplyAmount = ethers.parseUnits('2000', tokenConfig[token].decimals);
          await fundAccountWithToken(safeAddr, token, supplyAmount);

          const initialTokenBalance = await DAI.balanceOf(safeAddr);
          const initialSparkBalance = await mToken().balanceOf(safeAddr);

          await executeAction({
            type: 'SparkSupply',
            amount: supplyAmount,
            poolAddress,
          });

          const finalTokenBalance = await DAI.balanceOf(safeAddr);
          const finalsTokenBalance = await mToken().balanceOf(safeAddr);

          expect(finalTokenBalance).to.equal(initialTokenBalance - supplyAmount);
          expect(finalsTokenBalance).to.be.greaterThan(initialSparkBalance);
        });

        it('Should deposit max', async () => {
          const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
          await fundAccountWithToken(safeAddr, token, amount);

          expect(await DAI.balanceOf(safeAddr)).to.equal(amount);

          await executeAction({
            type: 'SparkSupply',
            amount: ethers.MaxUint256,
            poolAddress,
          });

          expect(await DAI.balanceOf(safeAddr)).to.equal(0);
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
            type: 'SparkSupply',
            poolAddress,
            amount,
            feeBasis: 10,
          });

          const mTokenBalanceAfterFirstTx = await mToken().balanceOf(safeAddr);

          // Time travel 1 year
          const protocolId = BigInt(
            ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['string'], ['Spark']))
          );
          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
            safeAddr,
            protocolId,
            poolAddress
          );
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          // Do another deposit to trigger fees
          const secondTx = await executeAction({
            type: 'SparkSupply',
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
          type: 'SparkSupply',
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
        const protocolId = BigInt(
          ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['string'], ['Spark']))
        );
        const initialLastFeeTimestamp = await adminVault.lastFeeTimestamp(
          safeAddr,
          protocolId,
          SPARK_DAI_ADDRESS
        );
        expect(initialLastFeeTimestamp).to.equal(BigInt(0));

        await fundAccountWithToken(safeAddr, 'DAI', 1000);

        const tx = await executeAction({
          type: 'SparkSupply',
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
          protocolId,
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
            type: 'SparkSupply',
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
          await executeAction({
            type: 'SparkSupply',
            poolAddress,
          });
        });

        it('Should withdraw token', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          await fundAccountWithToken(safeAddr, `s${token}`, amount);

          const initialTokenBalance = await DAI.balanceOf(safeAddr);
          const initialsTokenBalance = await mToken().balanceOf(safeAddr);

          await executeAction({
            type: 'SparkWithdraw',
            amount,
            poolAddress,
          });

          const finalTokenBalance = await DAI.balanceOf(safeAddr);
          const finalsTokenBalance = await mToken().balanceOf(safeAddr);
          expect(finalTokenBalance).to.equal(initialTokenBalance + amount);
          expect(finalsTokenBalance).to.be.lessThan(initialsTokenBalance);
        });

        it('Should withdraw max', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          await fundAccountWithToken(safeAddr, `s${token}`, amount);

          expect(await mToken().balanceOf(safeAddr)).to.equal(amount);

          await executeAction({
            type: 'SparkWithdraw',
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
            type: 'SparkSupply',
            poolAddress,
            amount,
            feeBasis: 10,
          });

          const mTokenBalanceAfterSupply = await mToken().balanceOf(safeAddr);

          const protocolId = BigInt(
            ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['string'], ['Spark']))
          );
          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
            safeAddr,
            protocolId,
            poolAddress
          );
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          const withdrawTx = await executeAction({
            type: 'SparkWithdraw',
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
          type: 'SparkSupply',
          poolAddress: SPARK_DAI_ADDRESS,
          amount: ethers.MaxUint256,
          feeBasis: 10,
        });

        // now lets withdraw
        const tx = await executeAction({
          type: 'SparkWithdraw',
          amount: ethers.MaxUint256,
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
            type: 'SparkWithdraw',
            poolAddress: '0x0000000000000000000000000000000000000000',
          })
        ).to.be.revertedWith('GS013');
      });
    });
  });
});

export {};
