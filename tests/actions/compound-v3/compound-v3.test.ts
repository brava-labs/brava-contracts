import { BytesLike } from 'ethers';
import { network } from 'hardhat';
import { ethers, expect, Signer } from '../..';
import { actionTypes } from '../../../tests/actions';
import { tokenConfig } from '../../../tests/constants';
import {
  AdminVault,
  CompoundV3Supply,
  CompoundV3Withdraw,
  IERC20,
  IERC4626,
  Logger,
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
import { fundAccountWithToken, getUSDC, getUSDT } from '../../utils-stable';

describe('Compound V3 tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let loggerAddress: string;
  let logger: Logger;
  let snapshotId: string;
  let USDC: IERC20;
  let USDT: IERC20;
  let compoundV3SupplyContract: CompoundV3Supply;
  let compoundV3WithdrawContract: CompoundV3Withdraw;
  let compoundV3SupplyAddress: string;
  let compoundV3WithdrawAddress: string;
  let cUSDCv3: IERC4626;
  let cUSDTv3: IERC4626;
  let adminVault: AdminVault;
  const COMPOUND_V3_USDC_ADDRESS = tokenConfig.cUSDCv3.address;
  const COMPOUND_V3_USDT_ADDRESS = tokenConfig.cUSDTv3.address;

  // Run tests for each supported token
  const testCases: Array<{
    token: keyof typeof tokenConfig;
    poolAddress: string;
    cToken: () => IERC4626;
  }> = [
    {
      token: 'USDC',
      poolAddress: tokenConfig.cUSDCv3.address,
      cToken: () => cUSDCv3,
    },
    {
      token: 'USDT',
      poolAddress: tokenConfig.cUSDTv3.address,
      cToken: () => cUSDTv3,
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
    // Fetch the USDC and USDT tokens
    USDC = await getUSDC();
    USDT = await getUSDT();

    // Initialize CompoundV3Supply and CompoundV3Withdraw actions
    compoundV3SupplyContract = await deploy(
      'CompoundV3Supply',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    compoundV3WithdrawContract = await deploy(
      'CompoundV3Withdraw',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    compoundV3SupplyAddress = await compoundV3SupplyContract.getAddress();
    compoundV3WithdrawAddress = await compoundV3WithdrawContract.getAddress();
    cUSDCv3 = await ethers.getContractAt('IERC4626', COMPOUND_V3_USDC_ADDRESS);
    cUSDTv3 = await ethers.getContractAt('IERC4626', COMPOUND_V3_USDT_ADDRESS);

    // Grant the cUSDCv3 and cUSDTv3 contracts the POOL_ROLE
    await adminVault.proposePool('Compound V3', COMPOUND_V3_USDC_ADDRESS);
    await adminVault.proposePool('Compound V3', COMPOUND_V3_USDT_ADDRESS);
    await adminVault.addPool('Compound V3', COMPOUND_V3_USDC_ADDRESS);
    await adminVault.addPool('Compound V3', COMPOUND_V3_USDT_ADDRESS);
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

  describe('Compound V3 Supply', () => {
    testCases.forEach(({ token, poolAddress, cToken }) => {
      describe(`Testing ${token}`, () => {
        it('Should deposit', async () => {
          const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialCompoundBalance = await cToken().balanceOf(safeAddr);

          await executeAction({
            type: 'CompoundV3Supply',
            poolAddress,
            amount,
            feeBasis: 0
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalcTokenBalance = await cToken().balanceOf(safeAddr);

          expect(finalTokenBalance).to.equal(initialTokenBalance - amount);
          expect(finalcTokenBalance).to.be.greaterThan(initialCompoundBalance);
        });

        it('Should deposit max', async () => {
          const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialCompoundBalance = await cToken().balanceOf(safeAddr);

          expect(initialTokenBalance).to.equal(amount);

          await executeAction({
            type: 'CompoundV3Supply',
            poolAddress,
            amount: ethers.MaxUint256,
            feeBasis: 0
          });

          expect(await tokenContract.balanceOf(safeAddr)).to.equal(0);
          expect(await cToken().balanceOf(safeAddr)).to.be.greaterThan(initialCompoundBalance);
        });

        it('Should take fees on deposit', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          const feeConfig = await adminVault.feeConfig();
          const feeRecipient = feeConfig.recipient;
          const feeRecipientTokenBalanceBefore = await tokenContract.balanceOf(feeRecipient);
          const feeRecipientcTokenBalanceBefore = await cToken().balanceOf(feeRecipient);

          // Do an initial deposit
          const firstTx = await executeAction({
            type: 'CompoundV3Supply',
            poolAddress,
            amount: amount,
            feeBasis: 0
          });

          const balanceAfterDeposit = await cToken().balanceOf(safeAddr);
          
          // Time travel 1 year
          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
              safeAddr,
              poolAddress
            );
            const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);
            await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);
            
            const cTokenBalanceAfterFirstTx = await cToken().balanceOf(safeAddr);

          // Do another deposit to trigger fees
          const secondTx = await executeAction({
            type: 'CompoundV3Supply',
            poolAddress,
            amount: '0',
            feeBasis: 10
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
            cTokenBalanceAfterFirstTx
          );
          const expectedFeeRecipientBalance = feeRecipientTokenBalanceBefore + expectedFee;

          // Check fees were taken, for Compound V3 we take fees in underlying
          expect(await tokenContract.balanceOf(feeRecipient)).to.be.greaterThanOrEqual(
            expectedFeeRecipientBalance
          );
          expect(await cToken().balanceOf(feeRecipient)).to.equal(feeRecipientcTokenBalanceBefore);
        });
      });
    });

    describe('General tests', () => {
      it('Should emit the correct log on deposit', async () => {
        const token = 'USDC';
        const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
        await fundAccountWithToken(safeAddr, token, amount);
        const strategyId: number = 42;
        const poolId: BytesLike = ethers.keccak256(COMPOUND_V3_USDC_ADDRESS).slice(0, 10);

        const tx = await executeAction({
          type: 'CompoundV3Supply',
          amount,
          feeBasis: 0
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
        expect(txLog).to.have.property('balanceBefore', BigInt(0));
        expect(txLog).to.have.property('balanceAfter');
        expect(txLog).to.have.property('feeInTokens');
        expect(txLog.balanceAfter).to.be.a('bigint');
        expect(txLog.balanceAfter).to.not.equal(BigInt(0));
      });

      it('Should initialize last fee timestamp', async () => {
        const initialLastFeeTimestamp = await adminVault.lastFeeTimestamp(
          safeAddr,
          COMPOUND_V3_USDC_ADDRESS
        );
        expect(initialLastFeeTimestamp).to.equal(BigInt(0));

        await fundAccountWithToken(safeAddr, 'USDC', 1000);

        const tx = await executeAction({
          type: 'CompoundV3Supply',
          feeBasis: 0
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
          COMPOUND_V3_USDC_ADDRESS
        );
        expect(finalLastFeeTimestamp).to.equal(BigInt(block.timestamp));
      });

      it('Should have deposit action type', async () => {
        const actionType = await compoundV3SupplyContract.actionType();
        expect(actionType).to.equal(actionTypes.DEPOSIT_ACTION);
      });

      it('Should reject invalid token', async () => {
        await expect(
          executeAction({
            type: 'CompoundV3Supply',
            poolAddress: '0x0000000000000000000000000000000000000000',
            feeBasis: 0
          })
        ).to.be.revertedWith('GS013');
      });
    });
  });

  describe('Compound V3 Withdraw', () => {
    beforeEach(async () => {
      // Do empty deposits to initialize the fee timestamps for both pools
      for (const { poolAddress } of testCases) {
        await executeAction({
          type: 'CompoundV3Supply',
          poolAddress,
          amount: '0',
          feeBasis: 0
        });
      }
    });

    testCases.forEach(({ token, poolAddress, cToken }) => {
      describe(`Testing ${token}`, () => {
        it('Should withdraw', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          // First deposit
          await executeAction({
            type: 'CompoundV3Supply',
            poolAddress,
            amount,
            feeBasis: 0
          });

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialCompoundBalance = await cToken().balanceOf(safeAddr);

          // Then withdraw
          await executeAction({
            type: 'CompoundV3Withdraw',
            poolAddress,
            amount,
            feeBasis: 0
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalCompoundBalance = await cToken().balanceOf(safeAddr);
          
          // Balance changes should be relative as interest accrues
          expect(finalTokenBalance).to.be.gt(initialTokenBalance);
          expect(finalCompoundBalance).to.be.lt(initialCompoundBalance);
        });

        it('Should withdraw the maximum amount', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          // First deposit
          await executeAction({
            type: 'CompoundV3Supply',
            poolAddress,
            amount,
            feeBasis: 0
          });

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          expect(await cToken().balanceOf(safeAddr)).to.be.gt(0);

          // Then withdraw max
          await executeAction({
            type: 'CompoundV3Withdraw',
            poolAddress,
            amount: ethers.MaxUint256,
            feeBasis: 0
          });

          expect(await cToken().balanceOf(safeAddr)).to.equal(0);
          expect(await tokenContract.balanceOf(safeAddr)).to.be.gt(initialTokenBalance);
        });

        it('Should take fees on withdraw', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          const feeConfig = await adminVault.feeConfig();
          const feeRecipient = feeConfig.recipient;
          const feeRecipientTokenBalanceBefore = await tokenContract.balanceOf(feeRecipient);

          // First deposit
          await executeAction({
            type: 'CompoundV3Supply',
            poolAddress,
            amount,
            feeBasis: 0
          });

          const balanceAfterDeposit = await cToken().balanceOf(safeAddr);

          // Time travel 1 year
          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(safeAddr, poolAddress);
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          // Withdraw a small amount to trigger fees
          await executeAction({
            type: 'CompoundV3Withdraw',
            poolAddress,
            amount: '1',
            feeBasis: 10
          });

          // Calculate expected fee (1% of balance after a year)
          const expectedFee = (balanceAfterDeposit * BigInt(10)) / BigInt(10000);
          const expectedFeeRecipientBalance = feeRecipientTokenBalanceBefore + expectedFee;

          // Allow for small rounding differences
          const actualFeeRecipientBalance = await tokenContract.balanceOf(feeRecipient);
          expect(actualFeeRecipientBalance).to.be.closeTo(
            expectedFeeRecipientBalance,
            ethers.parseUnits('0.01', tokenConfig[token].decimals) // Allow 0.01 token difference
          );
        });
      });
    });

    describe('General tests', () => {
      it('Should emit the correct log on withdraw', async () => {
        const token = 'USDC';
        const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
        await fundAccountWithToken(safeAddr, token, amount);
        const strategyId: number = 42;
        const poolId: BytesLike = ethers.keccak256(COMPOUND_V3_USDC_ADDRESS).slice(0, 10);
        const cToken = await ethers.getContractAt('IERC4626', COMPOUND_V3_USDC_ADDRESS);

        // First deposit
        await executeAction({
          type: 'CompoundV3Supply',
          poolAddress: COMPOUND_V3_USDC_ADDRESS,
          amount,
          feeBasis: 0
        });

        const balanceBeforeWithdraw = await cToken.balanceOf(safeAddr);

        const tx = await executeAction({
          type: 'CompoundV3Withdraw',
          poolAddress: COMPOUND_V3_USDC_ADDRESS,
          amount,
          feeBasis: 0
        });

        const logs = await decodeLoggerLog(tx);
        log('Logs:', logs);

        expect(logs).to.have.length(1);
        expect(logs[0]).to.have.property('eventId', BigInt(ACTION_LOG_IDS.BALANCE_UPDATE));

        const txLog = logs[0] as BalanceUpdateLog;
        expect(txLog).to.have.property('safeAddress', safeAddr);
        expect(txLog).to.have.property('strategyId', BigInt(strategyId));
        expect(txLog).to.have.property('poolId', poolId);
        expect(txLog).to.have.property('balanceBefore');
        expect(txLog).to.have.property('balanceAfter');
        expect(txLog).to.have.property('feeInTokens');
        // With Compound we earn extra tokens over time, so we can't check exact amounts
        expect(txLog.balanceBefore).to.be.greaterThanOrEqual(amount);
        expect(txLog.balanceAfter).to.be.lt(txLog.balanceBefore);
        expect(txLog.feeInTokens).to.equal(BigInt(0));
      });

      it('Should have withdraw action type', async () => {
        const actionType = await compoundV3WithdrawContract.actionType();
        expect(actionType).to.equal(actionTypes.WITHDRAW_ACTION);
      });

      it('Should reject invalid token', async () => {
        const amount = ethers.parseUnits('100', tokenConfig.USDC.decimals);
        await expect(
          executeAction({
            type: 'CompoundV3Withdraw',
            poolAddress: '0x0000000000000000000000000000000000000000',
            amount,
            feeBasis: 0
          })
        ).to.be.revertedWith('GS013');
      });
    });
  });
});

export {}; 