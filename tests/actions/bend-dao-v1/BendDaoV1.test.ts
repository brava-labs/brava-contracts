import { network } from 'hardhat';
import { ethers, expect, Signer } from '../..';
import { BEND_DAO_V1_POOL, tokenConfig } from '../../../tests/constants';
import {
  AdminVault,
  BendDaoV1Supply,
  BendDaoV1Withdraw,
  IERC20,
  Logger,
} from '../../../typechain-types';
import { actionTypes } from '../../actions';
import { ACTION_LOG_IDS, BalanceUpdateLog } from '../../logs';
import {
  calculateExpectedFee,
  decodeLoggerLog,
  deploy,
  executeAction,
  getBaseSetup,
  getBytes4,
  log,
} from '../../utils';
import { fundAccountWithToken, getTokenContract} from '../../utils-stable';

describe('BendDAO V1 tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let loggerAddress: string;
  let logger: Logger;
  let snapshotId: string;
  let USDT: IERC20;
  let bendSupplyContract: BendDaoV1Supply;
  let bendWithdrawContract: BendDaoV1Withdraw;
  let bendSupplyAddress: string;
  let bendWithdrawAddress: string;
  let adminVault: AdminVault;

  // Run tests for each supported token
  const testCases = [
    {
      token: 'USDT' as keyof typeof tokenConfig,
      bToken: tokenConfig.BEND_V1_USDT.address,
    },
  ];

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

    // Fetch the tokens
    USDT = await getTokenContract('USDT');

    // Initialize BendDaoV1Supply and BendDaoV1Withdraw actions
    bendSupplyContract = await deploy(
      'BendDaoV1Supply',
      signer,
      await adminVault.getAddress(),
      loggerAddress,
      BEND_DAO_V1_POOL
    );
    bendWithdrawContract = await deploy(
      'BendDaoV1Withdraw',
      signer,
      await adminVault.getAddress(),
      loggerAddress,
      BEND_DAO_V1_POOL
    );
    bendSupplyAddress = await bendSupplyContract.getAddress();
    bendWithdrawAddress = await bendWithdrawContract.getAddress();

    // grant the aToken contracts the POOL_ROLE and add actions
    await adminVault.proposeAction(getBytes4(bendSupplyAddress), bendSupplyAddress);
    await adminVault.proposeAction(getBytes4(bendWithdrawAddress), bendWithdrawAddress);
    await adminVault.addAction(getBytes4(bendSupplyAddress), bendSupplyAddress);
    await adminVault.addAction(getBytes4(bendWithdrawAddress), bendWithdrawAddress);

    for (const { token, bToken } of testCases) {
      await adminVault.proposePool('BendDaoV1', bToken);
      await adminVault.addPool('BendDaoV1', bToken);
    }
  });

  beforeEach(async () => {
    log('Taking local snapshot');
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    log('Reverting to local snapshot');
    await network.provider.send('evm_revert', [snapshotId]);
  });

  describe('BendDAO V1 Supply', () => {
    testCases.forEach(({ token, bToken }) => {
      describe(`Testing ${token}`, () => {
        it('Should deposit', async () => {
          const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          const bTokenContract = await ethers.getContractAt('IERC20', bToken);
          await fundAccountWithToken(safeAddr, token, amount);

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialBTokenBalance = await bTokenContract.balanceOf(safeAddr);

          await executeAction({
            type: 'BendDaoV1Supply',
            assetId: getBytes4(bToken),
            amount,
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalBTokenBalance = await bTokenContract.balanceOf(safeAddr);

          expect(finalTokenBalance).to.be.lt(initialTokenBalance);
          expect(finalBTokenBalance).to.be.gt(initialBTokenBalance);
        });

        it('Should deposit max', async () => {
          const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          const bTokenContract = await ethers.getContractAt('IERC20', bToken);
          await fundAccountWithToken(safeAddr, token, amount);

          await executeAction({
            type: 'BendDaoV1Supply',
            assetId: getBytes4(bToken),
            amount: ethers.MaxUint256.toString(),
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalBTokenBalance = await bTokenContract.balanceOf(safeAddr);
          expect(finalTokenBalance).to.equal(0n);
          expect(finalBTokenBalance).to.be.gt(0n);
        });

        it('Should take fees on deposit', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          const bTokenContract = await ethers.getContractAt('IERC20', bToken);
          await fundAccountWithToken(safeAddr, token, amount);

          const feeConfig = await adminVault.feeConfig();
          const feeRecipient = feeConfig.recipient;
          const feeRecipientTokenBalanceBefore = await tokenContract.balanceOf(feeRecipient);
          const feeRecipientBTokenBalanceBefore = await bTokenContract.balanceOf(feeRecipient);

          // Do an initial deposit
          const firstTx = await executeAction({
            type: 'BendDaoV1Supply',
            assetId: getBytes4(bToken),
            amount,
            feeBasis: 10,
          });

          const bTokenBalanceAfterFirstTx = await bTokenContract.balanceOf(safeAddr);

          // Time travel 1 year
          const protocolId = BigInt(
            ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['string'], ['BendDaoV1']))
          );
          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
            safeAddr,
            bToken
          );
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          // Do another deposit to trigger fees
          const secondTx = await executeAction({
            type: 'BendDaoV1Supply',
            assetId: getBytes4(bToken),
            amount: '0',
            feeBasis: 10,
          });

          const expectedFee = await calculateExpectedFee(
            (await firstTx.wait()) ??
              (() => {
                throw new Error('First deposit transaction failed');
              })(),
            (await secondTx.wait()) ??
              (() => {
                throw new Error('Second deposit transaction failed');
              })(),
            10,
            bTokenBalanceAfterFirstTx
          );
          const expectedFeeRecipientBalance = feeRecipientBTokenBalanceBefore + expectedFee;

          // With Aave we earn extra tokens over time, so the fee recipient should have more than the expected fee
          expect(await tokenContract.balanceOf(feeRecipient)).to.equal(
            feeRecipientTokenBalanceBefore
          );
          expect(await bTokenContract.balanceOf(feeRecipient)).to.be.greaterThanOrEqual(
            expectedFeeRecipientBalance
          );
        });
      });
    });

    describe('General tests', () => {
      it('Should emit the correct log on deposit', async () => {
        const token = 'USDT';
        const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
        await fundAccountWithToken(safeAddr, token, amount);
        const strategyId: number = 42;

        const tx = await executeAction({
          type: 'BendDaoV1Supply',
          assetId: getBytes4(tokenConfig.BEND_V1_USDT.address),
          amount: amount.toString(),
        });

        const logs = await decodeLoggerLog(tx);
        log('Logs:', logs);

        expect(logs).to.have.length(1);
        expect(logs[0]).to.have.property('eventId', BigInt(ACTION_LOG_IDS.BALANCE_UPDATE));

        const txLog = logs[0] as BalanceUpdateLog;
        expect(txLog).to.have.property('safeAddress', safeAddr);
        expect(txLog).to.have.property('strategyId', BigInt(strategyId));
        expect(txLog).to.have.property('poolId', getBytes4(tokenConfig.BEND_V1_USDT.address));
        expect(txLog).to.have.property('balanceBefore', 0n);
        expect(txLog).to.have.property('balanceAfter');
        expect(txLog).to.have.property('feeInTokens', 0n);
        expect(txLog.balanceAfter).to.be.a('bigint');
        expect(txLog.balanceAfter).to.not.equal(BigInt(0));
        expect(txLog.balanceAfter).to.be.greaterThanOrEqual(amount - 1n);
      });

      it('Should initialize the last fee timestamp', async () => {
        const token = 'USDT';
        const protocolId = BigInt(
          ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['string'], ['BendDaoV1']))
        );
        const lastFeeTimestamp = await adminVault.lastFeeTimestamp(
          safeAddr,
          tokenConfig.BEND_V1_USDT.address
        );
        expect(lastFeeTimestamp).to.equal(0n);

        await executeAction({
          type: 'BendDaoV1Supply',
          assetId: getBytes4(tokenConfig.BEND_V1_USDT.address),
          amount: '0',
        });

        const lastFeeTimestampAfter = await adminVault.lastFeeTimestamp(
          safeAddr,
          tokenConfig.BEND_V1_USDT.address
        );
        expect(lastFeeTimestampAfter).to.not.equal(0n);
      });

      it('Should have deposit action type', async () => {
        const actionType = await bendSupplyContract.actionType();
        expect(actionType).to.equal(actionTypes.DEPOSIT_ACTION);
      });

      it('Should reject invalid token', async () => {
        await expect(
          executeAction({
            type: 'BendDaoV1Supply',
            assetId: '0x00000000',
            amount: '1',
          })
        ).to.be.revertedWith('GS013');
      });
    });
  });

  describe('BendDAO V1 Withdraw', () => {
    beforeEach(async () => {
      // Do empty deposits to initialize the fee timestamps for all pools
      for (const { bToken } of testCases) {
        await executeAction({
          type: 'BendDaoV1Supply',
          assetId: getBytes4(bToken),
          amount: '0',
        });
      }
    });

    testCases.forEach(({ token, bToken }) => {
      describe(`Testing ${token}`, () => {
        it('Should withdraw', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          const bTokenContract = await ethers.getContractAt('IERC20', bToken);

          // Supply first
          await fundAccountWithToken(safeAddr, token, amount);
          await executeAction({
            type: 'BendDaoV1Supply',
            assetId: getBytes4(bToken),
            amount,
          });

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialBTokenBalance = await bTokenContract.balanceOf(safeAddr);

          await executeAction({
            type: 'BendDaoV1Withdraw',
            assetId: getBytes4(bToken),
            amount,
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalBTokenBalance = await bTokenContract.balanceOf(safeAddr);

          expect(finalTokenBalance).to.be.gt(initialTokenBalance);
          expect(finalBTokenBalance).to.be.lt(initialBTokenBalance);
        });

        it('Should withdraw the maximum amount', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          const bTokenContract = await ethers.getContractAt('IERC20', bToken);

          // Supply first
          await fundAccountWithToken(safeAddr, token, amount);
          await executeAction({
            type: 'BendDaoV1Supply',
            assetId: getBytes4(bToken),
            amount,
          });

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialBTokenBalance = await bTokenContract.balanceOf(safeAddr);
          expect(initialBTokenBalance).to.be.gt(0);

          await executeAction({
            type: 'BendDaoV1Withdraw',
            assetId: getBytes4(bToken),
            amount: ethers.MaxUint256,
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalBTokenBalance = await bTokenContract.balanceOf(safeAddr);

          expect(finalTokenBalance).to.be.gt(initialTokenBalance);
          expect(finalBTokenBalance).to.equal(0);
        });

        it('Should take fees on withdraw', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          const bTokenContract = await ethers.getContractAt('IERC20', bToken);

          const feeConfig = await adminVault.feeConfig();
          const feeRecipient = feeConfig.recipient;
          const feeRecipientTokenBalanceBefore = await tokenContract.balanceOf(feeRecipient);
          const feeRecipientBTokenBalanceBefore = await bTokenContract.balanceOf(feeRecipient);

          // Supply first
          await fundAccountWithToken(safeAddr, token, amount);
          const supplyTx = await executeAction({
            type: 'BendDaoV1Supply',
            assetId: getBytes4(bToken),
            amount,
            feeBasis: 10,
          });

          const bTokenBalanceAfterSupply = await bTokenContract.balanceOf(safeAddr);

          // Time travel 1 year
          const protocolId = BigInt(
            ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['string'], ['BendDaoV1']))
          );
          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
            safeAddr,
            bToken
          );
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          const withdrawTx = await executeAction({
            type: 'BendDaoV1Withdraw',
            assetId: getBytes4(bToken),
            amount: '10',
            feeBasis: 10,
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
            bTokenBalanceAfterSupply
          );
          const expectedFeeRecipientBalance = feeRecipientBTokenBalanceBefore + expectedFee;

          expect(await tokenContract.balanceOf(feeRecipient)).to.equal(
            feeRecipientTokenBalanceBefore
          );
          expect(await bTokenContract.balanceOf(feeRecipient)).to.be.greaterThanOrEqual(
            expectedFeeRecipientBalance
          );
        });
      });
    });

    describe('General tests', () => {
      it('Should emit the correct log on withdraw', async () => {
        const token = 'USDT';
        const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
        await fundAccountWithToken(safeAddr, token, amount);
        const strategyId: number = 42;

        // Supply first
        await executeAction({
          type: 'BendDaoV1Supply',
          assetId: getBytes4(tokenConfig.BEND_V1_USDT.address),
          amount,
        });

        const tx = await executeAction({
          type: 'BendDaoV1Withdraw',
          assetId: getBytes4(tokenConfig.BEND_V1_USDT.address),
          amount: amount.toString(),
        });

        const logs = await decodeLoggerLog(tx);
        log('Logs:', logs);

        expect(logs).to.have.length(1);
        expect(logs[0]).to.have.property('eventId', BigInt(ACTION_LOG_IDS.BALANCE_UPDATE));

        const txLog = logs[0] as BalanceUpdateLog;
        expect(txLog).to.have.property('safeAddress', safeAddr);
        expect(txLog).to.have.property('strategyId', BigInt(strategyId));
        expect(txLog).to.have.property('poolId', getBytes4(tokenConfig.BEND_V1_USDT.address));
        expect(txLog).to.have.property('balanceBefore');
        expect(txLog).to.have.property('balanceAfter');
        expect(txLog).to.have.property('feeInTokens', 0n);
        expect(txLog.balanceBefore).to.be.greaterThanOrEqual(amount);
        expect(txLog.balanceAfter).to.be.lt(txLog.balanceBefore);
      });

      it('Should have withdraw action type', async () => {
        const actionType = await bendWithdrawContract.actionType();
        expect(actionType).to.equal(actionTypes.WITHDRAW_ACTION);
      });

      it('Should reject invalid token', async () => {
        await expect(
          executeAction({
            type: 'BendDaoV1Withdraw',
            assetId: '0x00000000',
            amount: '1',
          })
        ).to.be.revertedWith('GS013');
      });
    });
  });
});

export {};
