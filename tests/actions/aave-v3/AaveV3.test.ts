import { network } from 'hardhat';
import { ethers, expect, Signer } from '../..';
import { actionTypes } from '../../../tests/actions';
import { AAVE_V3_POOL, tokenConfig } from '../../../tests/constants';
import {
  AaveV3Supply,
  AaveV3Withdraw,
  AdminVault,
  IERC20,
  IPool,
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
import { fundAccountWithToken, getTokenContract } from '../../utils-stable';

describe('Aave V3 tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let loggerAddress: string;
  let logger: Logger;
  let snapshotId: string;
  let USDC: IERC20;
  let USDT: IERC20;
  let DAI: IERC20;
  let aaveSupplyContract: AaveV3Supply;
  let aaveWithdrawContract: AaveV3Withdraw;
  let aaveSupplyAddress: string;
  let aaveWithdrawAddress: string;
  let aavePool: IPool;
  let adminVault: AdminVault;

  // Run tests for each supported token
  const testCases: Array<{
    token: keyof typeof tokenConfig;
    aToken: string;
    isIsolated: boolean;
  }> = [
    {
      token: 'USDC',
      aToken: tokenConfig.AAVE_V3_aUSDC.address,
      isIsolated: false,
    },
    {
      token: 'USDT',
      aToken: tokenConfig.AAVE_V3_aUSDT.address,
      isIsolated: true,
    },
    {
      token: 'DAI',
      aToken: tokenConfig.AAVE_V3_aDAI.address,
      isIsolated: false,
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

    // Fetch the tokens - using the enhanced multi-token functionality
    const tokens = await getTokenContract(['USDC', 'USDT', 'DAI']);
    USDC = tokens.USDC;
    USDT = tokens.USDT;
    DAI = tokens.DAI;

    // Initialize AaveSupply and AaveWithdraw actions
    aaveSupplyContract = await deploy(
      'AaveV3Supply',
      signer,
      await adminVault.getAddress(),
      loggerAddress,
      AAVE_V3_POOL
    );
    aaveWithdrawContract = await deploy(
      'AaveV3Withdraw',
      signer,
      await adminVault.getAddress(),
      loggerAddress,
      AAVE_V3_POOL
    );
    aaveSupplyAddress = await aaveSupplyContract.getAddress();
    aaveWithdrawAddress = await aaveWithdrawContract.getAddress();
    aavePool = await ethers.getContractAt('IPool', AAVE_V3_POOL);

    // grant the aToken contracts the POOL_ROLE and add actions
    await adminVault.proposeAction(getBytes4(aaveSupplyAddress), aaveSupplyAddress);
    await adminVault.proposeAction(getBytes4(aaveWithdrawAddress), aaveWithdrawAddress);
    await adminVault.addAction(getBytes4(aaveSupplyAddress), aaveSupplyAddress);
    await adminVault.addAction(getBytes4(aaveWithdrawAddress), aaveWithdrawAddress);

    for (const { aToken } of testCases) {
      await adminVault.proposePool('AaveV3', aToken);
      await adminVault.addPool('AaveV3', aToken);
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

  describe('Aave Supply', () => {
    testCases.forEach(({ token, aToken, isIsolated }) => {
      describe(`Testing ${token}`, () => {
        it('Should deposit', async () => {
          const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialAaveBalance = isIsolated
            ? await (await ethers.getContractAt('IERC20', aToken)).balanceOf(safeAddr)
            : (await aavePool.getUserAccountData(safeAddr)).totalCollateralBase;

          await executeAction({
            type: 'AaveV3Supply',
            assetId: getBytes4(aToken),
            amount,
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalAaveBalance = isIsolated
            ? await (await ethers.getContractAt('IERC20', aToken)).balanceOf(safeAddr)
            : (await aavePool.getUserAccountData(safeAddr)).totalCollateralBase;

          expect(finalTokenBalance).to.be.lt(initialTokenBalance);
          expect(finalAaveBalance).to.be.gt(initialAaveBalance);
        });

        it('Should deposit max', async () => {
          const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          await executeAction({
            type: 'AaveV3Supply',
            assetId: getBytes4(aToken),
            amount: ethers.MaxUint256.toString(),
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          expect(finalTokenBalance).to.equal(0n);
        });

        it('Should take fees on deposit', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          const aTokenContract = await ethers.getContractAt('IERC20', aToken);
          await fundAccountWithToken(safeAddr, token, amount);

          const feeConfig = await adminVault.feeConfig();
          const feeRecipient = feeConfig.recipient;
          const feeRecipientTokenBalanceBefore = await tokenContract.balanceOf(feeRecipient);
          const feeRecipientaTokenBalanceBefore = await aTokenContract.balanceOf(feeRecipient);

          // Do an initial deposit
          const firstTx = await executeAction({
            type: 'AaveV3Supply',
            assetId: getBytes4(aToken),
            amount,
            feeBasis: 10,
          });

          const aTokenBalanceAfterFirstTx = await aTokenContract.balanceOf(safeAddr);

          // Time travel 1 year
          const protocolId = BigInt(
            ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['string'], ['AaveV3']))
          );
          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
            safeAddr,
            aToken
          );
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          // Do another deposit to trigger fees
          const secondTx = await executeAction({
            type: 'AaveV3Supply',
            assetId: getBytes4(aToken),
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
            aTokenBalanceAfterFirstTx
          );
          const expectedFeeRecipientBalance = feeRecipientaTokenBalanceBefore + expectedFee;

          // With Aave we earn extra tokens over time, so the fee recipient should have more than the expected fee
          expect(await tokenContract.balanceOf(feeRecipient)).to.equal(
            feeRecipientTokenBalanceBefore
          );
          expect(await aTokenContract.balanceOf(feeRecipient)).to.be.greaterThanOrEqual(
            expectedFeeRecipientBalance
          );
        });
      });
    });

    describe('General tests', () => {
      it('Should emit the correct log on deposit', async () => {
        const token = 'USDC';
        const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
        await fundAccountWithToken(safeAddr, token, amount);
        const strategyId: number = 42;

        const tx = await executeAction({
          type: 'AaveV3Supply',
          assetId: getBytes4(tokenConfig.AAVE_V3_aUSDC.address),
          amount: amount.toString(),
        });

        const logs = await decodeLoggerLog(tx);
        log('Logs:', logs);

        expect(logs).to.have.length(1);
        expect(logs[0]).to.have.property('eventId', BigInt(ACTION_LOG_IDS.BALANCE_UPDATE));

        const txLog = logs[0] as BalanceUpdateLog;
        expect(txLog).to.have.property('safeAddress', safeAddr);
        expect(txLog).to.have.property('strategyId', BigInt(strategyId));
        expect(txLog).to.have.property('poolId', getBytes4(tokenConfig.AAVE_V3_aUSDC.address));
        expect(txLog).to.have.property('balanceBefore', 0n);
        expect(txLog).to.have.property('balanceAfter');
        expect(txLog).to.have.property('feeInTokens', 0n);
        expect(txLog.balanceAfter).to.be.a('bigint');
        expect(txLog.balanceAfter).to.be.greaterThanOrEqual(amount - 1n);
      });

      it('Should initialize the last fee timestamp', async () => {
        const protocolId = BigInt(
          ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['string'], ['AaveV3']))
        );
        const lastFeeTimestamp = await adminVault.lastFeeTimestamp(
          safeAddr,
          tokenConfig.AAVE_V3_aUSDC.address
        );
        expect(lastFeeTimestamp).to.equal(0n);

        await executeAction({
          type: 'AaveV3Supply',
          assetId: getBytes4(tokenConfig.AAVE_V3_aUSDC.address),
          amount: '0',
        });

        const lastFeeTimestampAfter = await adminVault.lastFeeTimestamp(
          safeAddr,
          tokenConfig.AAVE_V3_aUSDC.address
        );
        expect(lastFeeTimestampAfter).to.not.equal(0n);
      });

      it('Should have deposit action type', async () => {
        const actionType = await aaveSupplyContract.actionType();
        expect(actionType).to.equal(actionTypes.DEPOSIT_ACTION);
      });

      it('Should reject invalid token', async () => {
        await expect(
          executeAction({
            type: 'AaveV3Supply',
            assetId: '0x00000000',
            amount: '1',
          })
        ).to.be.revertedWith('GS013');
      });
    });
  });

  describe('Aave Withdraw', () => {
    beforeEach(async () => {
      // Do empty deposits to initialize the fee timestamps for all pools
      for (const { aToken } of testCases) {
        await executeAction({
          type: 'AaveV3Supply',
          assetId: getBytes4(aToken),
          amount: '0',
        });
      }
    });

    testCases.forEach(({ token, aToken, isIsolated }) => {
      describe(`Testing ${token}`, () => {
        it('Should withdraw', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          const aTokenContract = await ethers.getContractAt('IERC20', aToken);

          // Supply first
          await fundAccountWithToken(safeAddr, token, amount);
          await executeAction({
            type: 'AaveV3Supply',
            assetId: getBytes4(aToken),
            amount,
          });

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialAaveBalance = isIsolated
            ? await aTokenContract.balanceOf(safeAddr)
            : (await aavePool.getUserAccountData(safeAddr)).totalCollateralBase;

          await executeAction({
            type: 'AaveV3Withdraw',
            assetId: getBytes4(aToken),
            amount,
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalAaveBalance = isIsolated
            ? await aTokenContract.balanceOf(safeAddr)
            : (await aavePool.getUserAccountData(safeAddr)).totalCollateralBase;

          expect(finalTokenBalance).to.be.gt(initialTokenBalance);
          expect(finalAaveBalance).to.be.lt(initialAaveBalance);
        });

        it('Should withdraw the maximum amount', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          const aTokenContract = await ethers.getContractAt('IERC20', aToken);

          // Supply first
          await fundAccountWithToken(safeAddr, token, amount);
          await executeAction({
            type: 'AaveV3Supply',
            assetId: getBytes4(aToken),
            amount,
          });

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialAaveBalance = await aTokenContract.balanceOf(safeAddr);
          expect(initialAaveBalance).to.be.gt(0);

          await executeAction({
            type: 'AaveV3Withdraw',
            assetId: getBytes4(aToken),
            amount: ethers.MaxUint256,
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalAaveBalance = await aTokenContract.balanceOf(safeAddr);

          expect(finalTokenBalance).to.be.gt(initialTokenBalance);
          expect(finalAaveBalance).to.equal(0);
        });

        it('Should take fees on withdraw', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          const aTokenContract = await ethers.getContractAt('IERC20', aToken);

          const feeConfig = await adminVault.feeConfig();
          const feeRecipient = feeConfig.recipient;
          const feeRecipientTokenBalanceBefore = await tokenContract.balanceOf(feeRecipient);
          const feeRecipientaTokenBalanceBefore = await aTokenContract.balanceOf(feeRecipient);

          // Supply first
          await fundAccountWithToken(safeAddr, token, amount);
          const supplyTx = await executeAction({
            type: 'AaveV3Supply',
            assetId: getBytes4(aToken),
            amount,
            feeBasis: 10,
          });

          const aTokenBalanceAfterSupply = await aTokenContract.balanceOf(safeAddr);

          // Time travel 1 year
          const protocolId = BigInt(
            ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['string'], ['AaveV3']))
          );
          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
            safeAddr,
            aToken
          );
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          const withdrawTx = await executeAction({
            type: 'AaveV3Withdraw',
            assetId: getBytes4(aToken),
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
            aTokenBalanceAfterSupply
          );
          const expectedFeeRecipientBalance = feeRecipientaTokenBalanceBefore + expectedFee;

          expect(await tokenContract.balanceOf(feeRecipient)).to.equal(
            feeRecipientTokenBalanceBefore
          );
          expect(await aTokenContract.balanceOf(feeRecipient)).to.be.greaterThanOrEqual(
            expectedFeeRecipientBalance
          );
        });
      });
    });

    describe('General tests', () => {
      it('Should emit the correct log on withdraw', async () => {
        const token = 'AAVE_V3_aUSDC';
        const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
        await fundAccountWithToken(safeAddr, token, amount);
        const strategyId: number = 42;

        const tx = await executeAction({
          type: 'AaveV3Withdraw',
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
        // With aave we earn extra tokens over time, so slow tests mean we can't check exact amounts
        expect(txLog.balanceBefore).to.be.greaterThanOrEqual(amount);
      });
      it('Should have withdraw action type', async () => {
        const actionType = await aaveWithdrawContract.actionType();
        expect(actionType).to.equal(actionTypes.WITHDRAW_ACTION);
      });

      it('Should reject invalid token', async () => {
        await expect(
          executeAction({
            type: 'AaveV3Withdraw',
            assetId: '0x00000000',
            amount: '1',
          })
        ).to.be.revertedWith('GS013');
      });
    });
  });
});

export {};
