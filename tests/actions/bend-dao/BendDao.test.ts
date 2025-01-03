import { network } from 'hardhat';
import { ethers, expect, Signer } from '../..';
import { actionTypes } from '../../../tests/actions';
import { BEND_DAO_V1_POOL, tokenConfig } from '../../../tests/constants';
import {
  AdminVault,
  BendDaoSupply,
  BendDaoWithdraw,
  IERC20,
  Logger,
} from '../../../typechain-types';
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
import { fundAccountWithToken, getUSDT } from '../../utils-stable';

describe('BendDAO V1 tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let loggerAddress: string;
  let logger: Logger;
  let snapshotId: string;
  let USDT: IERC20;
  let bendSupplyContract: BendDaoSupply;
  let bendWithdrawContract: BendDaoWithdraw;
  let bendSupplyAddress: string;
  let bendWithdrawAddress: string;
  let adminVault: AdminVault;

  // Run tests for each supported token
  const testCases: Array<{
    token: keyof typeof tokenConfig;
    bToken: string;
  }> = [
    {
      token: 'USDT',
      bToken: tokenConfig.bendUSDT.address,
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
    USDT = await getUSDT();

    // Initialize BendDaoSupply and BendDaoWithdraw actions
    bendSupplyContract = await deploy(
      'BendDaoSupply',
      signer,
      await adminVault.getAddress(),
      loggerAddress,
      BEND_DAO_V1_POOL
    );
    bendWithdrawContract = await deploy(
      'BendDaoWithdraw',
      signer,
      await adminVault.getAddress(),
      loggerAddress,
      BEND_DAO_V1_POOL
    );
    bendSupplyAddress = await bendSupplyContract.getAddress();
    bendWithdrawAddress = await bendWithdrawContract.getAddress();

    // grant the bToken contracts the POOL_ROLE and add actions
    await adminVault.proposeAction(getBytes4(bendSupplyAddress), bendSupplyAddress);
    await adminVault.proposeAction(getBytes4(bendWithdrawAddress), bendWithdrawAddress);
    await adminVault.addAction(getBytes4(bendSupplyAddress), bendSupplyAddress);
    await adminVault.addAction(getBytes4(bendWithdrawAddress), bendWithdrawAddress);

    for (const { bToken } of testCases) {
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

  describe('BendDAO Supply', () => {
    testCases.forEach(({ token, bToken }) => {
      describe(`Testing ${token}`, () => {
        it('Should deposit', async () => {
          const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          const bTokenContract = await ethers.getContractAt('IERC20', bToken);
          await fundAccountWithToken(safeAddr, token, amount);

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialBendBalance = await bTokenContract.balanceOf(safeAddr);

          await executeAction({
            type: 'BendDaoSupply',
            assetId: getBytes4(bToken),
            amount,
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalBendBalance = await bTokenContract.balanceOf(safeAddr);

          expect(finalTokenBalance).to.be.lt(initialTokenBalance);
          expect(finalBendBalance).to.be.gt(initialBendBalance);
        });

        it('Should deposit max', async () => {
          const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          await executeAction({
            type: 'BendDaoSupply',
            assetId: getBytes4(bToken),
            amount: ethers.MaxUint256.toString(),
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          expect(finalTokenBalance).to.equal(0n);
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
            type: 'BendDaoSupply',
            assetId: getBytes4(bToken),
            amount,
            feeBasis: 10,
          });

          const bTokenBalanceAfterFirstTx = await bTokenContract.balanceOf(safeAddr);

          // Time travel 1 year
          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
            safeAddr,
            bToken
          );
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          // Do another deposit to trigger fees
          const secondTx = await executeAction({
            type: 'BendDaoSupply',
            assetId: getBytes4(bToken),
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
            bTokenBalanceAfterFirstTx
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
      it('Should emit the correct log on deposit', async () => {
        const token = 'USDT';
        const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
        await fundAccountWithToken(safeAddr, token, amount);
        const strategyId: number = 42;

        const tx = await executeAction({
          type: 'BendDaoSupply',
          assetId: getBytes4(tokenConfig.bendUSDT.address),
          amount: amount.toString(),
        });

        const logs = await decodeLoggerLog(tx);
        log('Logs:', logs);

        expect(logs).to.have.length(1);
        expect(logs[0]).to.have.property('eventId', BigInt(ACTION_LOG_IDS.BALANCE_UPDATE));

        const txLog = logs[0] as BalanceUpdateLog;
        expect(txLog).to.have.property('safeAddress', safeAddr);
        expect(txLog).to.have.property('strategyId', BigInt(strategyId));
        expect(txLog).to.have.property('poolId', getBytes4(tokenConfig.bendUSDT.address));
        expect(txLog).to.have.property('balanceBefore', 0n);
        expect(txLog).to.have.property('balanceAfter');
        expect(txLog).to.have.property('feeInTokens', 0n);
        expect(txLog.balanceAfter).to.be.a('bigint');
        expect(txLog.balanceAfter).to.not.equal(BigInt(0));
        expect(txLog.balanceAfter).to.be.greaterThanOrEqual(amount - 1n);
      });

      it('Should initialize the last fee timestamp', async () => {
        const lastFeeTimestamp = await adminVault.lastFeeTimestamp(
          safeAddr,
          tokenConfig.bendUSDT.address
        );
        expect(lastFeeTimestamp).to.equal(0n);

        await executeAction({
          type: 'BendDaoSupply',
          assetId: getBytes4(tokenConfig.bendUSDT.address),
          amount: '0',
        });

        const lastFeeTimestampAfter = await adminVault.lastFeeTimestamp(
          safeAddr,
          tokenConfig.bendUSDT.address
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
            type: 'BendDaoSupply',
            assetId: '0x00000000',
            amount: '1',
          })
        ).to.be.revertedWith('GS013');
      });
    });
  });

  describe('BendDAO Withdraw', () => {
    beforeEach(async () => {
      // Do empty deposits to initialize the fee timestamps for all pools
      for (const { bToken } of testCases) {
        await executeAction({
          type: 'BendDaoSupply',
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
            type: 'BendDaoSupply',
            assetId: getBytes4(bToken),
            amount,
          });

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialBendBalance = await bTokenContract.balanceOf(safeAddr);

          await executeAction({
            type: 'BendDaoWithdraw',
            assetId: getBytes4(bToken),
            amount,
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalBendBalance = await bTokenContract.balanceOf(safeAddr);

          expect(finalTokenBalance).to.be.gt(initialTokenBalance);
          expect(finalBendBalance).to.be.lt(initialBendBalance);
        });

        it('Should withdraw the maximum amount', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          const bTokenContract = await ethers.getContractAt('IERC20', bToken);

          // Supply first
          await fundAccountWithToken(safeAddr, token, amount);
          await executeAction({
            type: 'BendDaoSupply',
            assetId: getBytes4(bToken),
            amount,
          });

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialBendBalance = await bTokenContract.balanceOf(safeAddr);
          expect(initialBendBalance).to.be.gt(0);

          await executeAction({
            type: 'BendDaoWithdraw',
            assetId: getBytes4(bToken),
            amount: ethers.MaxUint256,
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalBendBalance = await bTokenContract.balanceOf(safeAddr);

          expect(finalTokenBalance).to.be.gt(initialTokenBalance);
          expect(finalBendBalance).to.equal(0);
        });

        it('Should take fees on withdraw', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          const bTokenContract = await ethers.getContractAt('IERC20', bToken);

          const feeConfig = await adminVault.feeConfig();
          const feeRecipient = feeConfig.recipient;
          const feeRecipientTokenBalanceBefore = await tokenContract.balanceOf(feeRecipient);
          const feeRecipientbTokenBalanceBefore = await bTokenContract.balanceOf(feeRecipient);

          // Supply first
          await fundAccountWithToken(safeAddr, token, amount);
          const supplyTx = await executeAction({
            type: 'BendDaoSupply',
            assetId: getBytes4(bToken),
            amount,
            feeBasis: 10,
          });

          const bTokenBalanceAfterSupply = await bTokenContract.balanceOf(safeAddr);

          // Time travel 1 year
          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
            safeAddr,
            bToken
          );
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          const withdrawTx = await executeAction({
            type: 'BendDaoWithdraw',
            assetId: getBytes4(bToken),
            amount: '1',
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
          const expectedFeeRecipientBalance = feeRecipientbTokenBalanceBefore + expectedFee;

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
        const token = 'bendUSDT';
        const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
        await fundAccountWithToken(safeAddr, token, amount);
        const strategyId: number = 42;

        const tx = await executeAction({
          type: 'BendDaoWithdraw',
          assetId: getBytes4(tokenConfig[token].address),
          amount: ethers.MaxUint256.toString(),
        });

        const logs = await decodeLoggerLog(tx);
        log('Logs:', logs);

        expect(logs).to.have.length(1);
        expect(logs[0]).to.have.property('eventId', BigInt(ACTION_LOG_IDS.BALANCE_UPDATE));

        const txLog = logs[0] as BalanceUpdateLog;
        expect(txLog).to.have.property('safeAddress', safeAddr);
        expect(txLog).to.have.property('strategyId', BigInt(strategyId));
        expect(txLog).to.have.property('poolId', getBytes4(tokenConfig[token].address));
        expect(txLog).to.have.property('balanceBefore');
        expect(txLog).to.have.property('balanceAfter', 0n);
        expect(txLog).to.have.property('feeInTokens', 0n);
        expect(txLog.balanceAfter).to.be.a('bigint');
        expect(txLog.balanceBefore).to.be.a('bigint');
        expect(txLog.balanceBefore).to.be.greaterThanOrEqual(amount);
      });

      it('Should have withdraw action type', async () => {
        const actionType = await bendWithdrawContract.actionType();
        expect(actionType).to.equal(actionTypes.WITHDRAW_ACTION);
      });

      it('Should reject invalid token', async () => {
        await expect(
          executeAction({
            type: 'BendDaoWithdraw',
            assetId: '0x00000000',
            amount: '1',
          })
        ).to.be.revertedWith('GS013');
      });
    });
  });
});

export {};
