import { ethers, expect, Signer } from '../..';
import { network } from 'hardhat';
import {
  executeAction,
  calculateExpectedFee,
  getBaseSetup,
  deploy,
  log,
  getBytes4,
  decodeLoggerLog,
  getTokenNameFromAddress,
  getTypedContract,
} from '../../utils';
import { fundAccountWithToken, getTokenContract } from '../../utils-stable';
import { tokenConfig } from '../../constants';
import {
  AdminVault,
  IERC4626,
  IERC20,
  CurveSavingsSupply,
  CurveSavingsWithdraw,
  Logger,
} from '../../../typechain-types';
import { ACTION_LOG_IDS } from '../../logs';
import { actionTypes } from '../../actions';
import { BytesLike } from 'ethers';
import { BalanceUpdateLog } from '../../logs';

describe('CurveSavings tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let loggerAddress: string;
  let logger: Logger;
  let snapshotId: string;
  let crvUSD: IERC20;
  let curveSavingsSupplyContract: CurveSavingsSupply;
  let curveSavingsWithdrawContract: CurveSavingsWithdraw;
  let curveSavingsSupplyAddress: string;
  let curveSavingsWithdrawAddress: string;
  let scrvUSD: IERC4626;
  let adminVault: AdminVault;
  const CURVE_SAVINGS_SCRVUSD_ADDRESS = tokenConfig.CURVE_SAVINGS_scrvUSD.address;
  const CURVE_SAVINGS_CVCRVUSD_ADDRESS = tokenConfig.CURVE_SAVINGS_cvcrvUSD.address;
  let cvcrvUSD: IERC4626;

  const testCases: Array<{
    token: keyof typeof tokenConfig;
    poolAddress: string;
    vaultToken: () => IERC4626;
  }> = [
    {
      token: 'crvUSD',
      poolAddress: CURVE_SAVINGS_SCRVUSD_ADDRESS,
      vaultToken: () => scrvUSD,
    },
    {
      token: 'crvUSD',
      poolAddress: CURVE_SAVINGS_CVCRVUSD_ADDRESS,
      vaultToken: () => cvcrvUSD,
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
    logger = await getTypedContract<Logger>('Logger', loggerAddress);
    adminVault = await baseSetup.adminVault;

    // Fetch the tokens
    crvUSD = await getTokenContract('crvUSD');

    // Initialize CurveSavingsSupply and CurveSavingsWithdraw actions
    curveSavingsSupplyContract = await deploy(
      'CurveSavingsSupply',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    curveSavingsWithdrawContract = await deploy(
      'CurveSavingsWithdraw',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    curveSavingsSupplyAddress = await curveSavingsSupplyContract.getAddress();
    curveSavingsWithdrawAddress = await curveSavingsWithdrawContract.getAddress();
    scrvUSD = await getTypedContract<IERC4626>('IERC4626', CURVE_SAVINGS_SCRVUSD_ADDRESS);
    cvcrvUSD = await getTypedContract<IERC4626>('IERC4626', CURVE_SAVINGS_CVCRVUSD_ADDRESS);

    // grant the scrvUSD contract the POOL_ROLE
    for (const { poolAddress } of testCases) {
      await adminVault.proposePool('CurveSavings', poolAddress);
      await adminVault.addPool('CurveSavings', poolAddress);
    }

    // Add supply and withdraw actions
    await adminVault.proposeAction(getBytes4(curveSavingsSupplyAddress), curveSavingsSupplyAddress);
    await adminVault.proposeAction(
      getBytes4(curveSavingsWithdrawAddress),
      curveSavingsWithdrawAddress
    );
    await adminVault.addAction(getBytes4(curveSavingsSupplyAddress), curveSavingsSupplyAddress);
    await adminVault.addAction(getBytes4(curveSavingsWithdrawAddress), curveSavingsWithdrawAddress);
  });

  beforeEach(async () => {
    log('Taking local snapshot');
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    log('Reverting to local snapshot');
    await network.provider.send('evm_revert', [snapshotId]);
  });

  describe('CurveSavings Supply', () => {
    testCases.forEach(({ token, poolAddress, vaultToken }) => {
      describe(`Testing ${getTokenNameFromAddress(poolAddress)}`, () => {
        it('Should supply', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialVaultTokenBalance = await vaultToken().balanceOf(safeAddr);

          await executeAction({
            type: 'CurveSavingsSupply',
            poolAddress,
            amount,
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalVaultTokenBalance = await vaultToken().balanceOf(safeAddr);
          expect(finalTokenBalance).to.be.eq(BigInt(0));
          expect(finalVaultTokenBalance).to.be.greaterThan(initialVaultTokenBalance);
        });

        it('Should supply max', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          expect(await tokenContract.balanceOf(safeAddr)).to.equal(amount);

          await executeAction({
            type: 'CurveSavingsSupply',
            poolAddress,
            amount: ethers.MaxUint256,
          });

          expect(await tokenContract.balanceOf(safeAddr)).to.equal(0);
          expect(await vaultToken().balanceOf(safeAddr)).to.be.greaterThan(0);
        });

        it('Should take fees on supply', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          const feeConfig = await adminVault.feeConfig();
          const feeRecipient = feeConfig.recipient;
          const feeRecipientTokenBalanceBefore = await tokenContract.balanceOf(feeRecipient);
          const feeRecipientVaultTokenBalanceBefore = await vaultToken().balanceOf(feeRecipient);

          const firstTx = await executeAction({
            type: 'CurveSavingsSupply',
            poolAddress,
            amount,
            feeBasis: 10,
          });

          const firstTxReceipt = await firstTx.wait();
          if (!firstTxReceipt) {
            throw new Error('Transaction failed');
          }

          const vaultTokenBalanceAfterFirstTx = await vaultToken().balanceOf(safeAddr);

          // Time travel 1 year
          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(safeAddr, poolAddress);
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          const secondTx = await executeAction({
            type: 'CurveSavingsSupply',
            poolAddress,
            amount: '0',
            feeBasis: 10,
          });
          const secondTxReceipt = await secondTx.wait();
          if (!secondTxReceipt) {
            throw new Error('Transaction failed');
          }

          const expectedFee = await calculateExpectedFee(
            firstTxReceipt,
            secondTxReceipt,
            10,
            vaultTokenBalanceAfterFirstTx
          );
          const expectedFeeRecipientBalance = feeRecipientVaultTokenBalanceBefore + expectedFee;

          expect(await tokenContract.balanceOf(feeRecipient)).to.equal(
            feeRecipientTokenBalanceBefore
          );
          expect(await vaultToken().balanceOf(feeRecipient)).to.equal(expectedFeeRecipientBalance);
        });
      });
    });

    describe('General tests', () => {
      it('Should emit the correct log on supply', async () => {
        const token = 'crvUSD';
        const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
        await fundAccountWithToken(safeAddr, token, amount);
        const strategyId: number = 42;
        const poolId: BytesLike = ethers.keccak256(CURVE_SAVINGS_SCRVUSD_ADDRESS).slice(0, 10);

        const tx = await executeAction({
          type: 'CurveSavingsSupply',
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

      it('Should initialize last fee timestamp', async () => {
        const initialLastFeeTimestamp = await adminVault.lastFeeTimestamp(
          safeAddr,
          CURVE_SAVINGS_SCRVUSD_ADDRESS
        );
        expect(initialLastFeeTimestamp).to.equal(0n);

        await executeAction({
          type: 'CurveSavingsSupply',
          poolAddress: CURVE_SAVINGS_SCRVUSD_ADDRESS,
          amount: '0',
        });

        const finalLastFeeTimestamp = await adminVault.lastFeeTimestamp(
          safeAddr,
          CURVE_SAVINGS_SCRVUSD_ADDRESS
        );
        expect(finalLastFeeTimestamp).to.not.equal(0n);
      });

      it('Should have supply action type', async () => {
        const actionType = await curveSavingsSupplyContract.actionType();
        expect(actionType).to.equal(actionTypes.DEPOSIT_ACTION);
      });

      it('Should reject invalid token', async () => {
        await expect(
          executeAction({
            type: 'CurveSavingsSupply',
            poolAddress: '0x0000000000000000000000000000000000000000',
            amount: '1',
          })
        ).to.be.revertedWith('GS013');
      });

      it('Should not confuse underlying and share tokens', async () => {
        const pool = await ethers.getContractAt('IERC4626', CURVE_SAVINGS_SCRVUSD_ADDRESS);

        // Fund with excess underlying tokens
        const largeAmount = ethers.parseUnits('1000', tokenConfig.crvUSD.decimals);
        const smallDepositAmount = ethers.parseUnits('100', tokenConfig.crvUSD.decimals);
        await fundAccountWithToken(safeAddr, 'crvUSD', largeAmount);

        const initialUnderlyingBalance = await crvUSD.balanceOf(safeAddr);
        expect(initialUnderlyingBalance).to.equal(largeAmount);

        // Deposit smaller amount
        await executeAction({
          type: 'CurveSavingsSupply',
          poolAddress: CURVE_SAVINGS_SCRVUSD_ADDRESS,
          amount: smallDepositAmount,
        });

        // Verify we still have 900 tokens
        const remainingUnderlying = await crvUSD.balanceOf(safeAddr);
        expect(remainingUnderlying).to.equal(largeAmount - smallDepositAmount);

        // Get share balance - should represent 100 tokens worth
        const sharesReceived = await pool.balanceOf(safeAddr);

        // Try to withdraw only 10 tokens worth
        const smallWithdrawAmount = ethers.parseUnits('10', tokenConfig.crvUSD.decimals);
        await executeAction({
          type: 'CurveSavingsWithdraw',
          poolAddress: CURVE_SAVINGS_SCRVUSD_ADDRESS,
          amount: smallWithdrawAmount,
        });

        // Verify balances
        const finalShares = await pool.balanceOf(safeAddr);
        const finalUnderlying = await crvUSD.balanceOf(safeAddr);

        // Should have ~90 worth of shares left (minus any fees/slippage)
        const expectedSharesBurned = await pool.convertToShares(smallWithdrawAmount);
        expect(finalShares).to.be.closeTo(
          sharesReceived - expectedSharesBurned,
          ethers.parseUnits('1', tokenConfig.crvUSD.decimals) // Much smaller tolerance since we're using exact conversion
        );

        // Should have ~910 tokens (900 + 10 withdrawn)
        expect(finalUnderlying).to.be.closeTo(
          remainingUnderlying + smallWithdrawAmount,
          ethers.parseUnits('0.1', tokenConfig.crvUSD.decimals)
        );
      });
    });
  });

  describe('CurveSavings Withdraw', () => {
    beforeEach(async () => {
      // Initialize the fee timestamp for all pools
      for (const { poolAddress } of testCases) {
        await executeAction({
          type: 'CurveSavingsSupply',
          poolAddress,
          amount: '0',
        });
      }
    });

    testCases.forEach(({ token, poolAddress, vaultToken }) => {
      describe(`Testing ${getTokenNameFromAddress(poolAddress)}`, () => {
        it('Should withdraw', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          // Supply first
          await executeAction({
            type: 'CurveSavingsSupply',
            poolAddress,
            amount,
          });

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialVaultBalance = await vaultToken().balanceOf(safeAddr);

          await executeAction({
            type: 'CurveSavingsWithdraw',
            poolAddress,
            amount,
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalVaultBalance = await vaultToken().balanceOf(safeAddr);

          expect(finalTokenBalance).to.be.gt(initialTokenBalance);
          expect(finalVaultBalance).to.be.lt(initialVaultBalance);
        });

        it('Should withdraw the maximum amount', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          // Supply first
          await executeAction({
            type: 'CurveSavingsSupply',
            poolAddress,
            amount,
          });

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialVaultBalance = await vaultToken().balanceOf(safeAddr);
          expect(initialVaultBalance).to.be.gt(0);

          await executeAction({
            type: 'CurveSavingsWithdraw',
            poolAddress,
            amount: ethers.MaxUint256,
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalVaultBalance = await vaultToken().balanceOf(safeAddr);

          expect(finalTokenBalance).to.be.gt(initialTokenBalance);
          // Some protocols might retain a very small dust amount due to rounding
          // Use a small tolerance instead of expecting exactly zero
          const smallDust = ethers.parseUnits('0.001', 18); // Small dust allowance in 18 decimals
          expect(finalVaultBalance).to.be.lessThanOrEqual(smallDust);
        });

        it('Should take fees on withdraw', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          const feeConfig = await adminVault.feeConfig();
          const feeRecipient = feeConfig.recipient;
          const feeRecipientTokenBalanceBefore = await tokenContract.balanceOf(feeRecipient);
          const feeRecipientVaultTokenBalanceBefore = await vaultToken().balanceOf(feeRecipient);

          // Supply first
          const supplyTx = await executeAction({
            type: 'CurveSavingsSupply',
            poolAddress,
            amount,
            feeBasis: 10,
          });

          const vaultTokenBalanceAfterSupply = await vaultToken().balanceOf(safeAddr);

          // Time travel 1 year
          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(safeAddr, poolAddress);
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          // Withdraw to trigger fees
          const withdrawTx = await executeAction({
            type: 'CurveSavingsWithdraw',
            poolAddress,
            amount: '1',
            feeBasis: 10,
          });

          const expectedFee = await calculateExpectedFee(
            (await supplyTx.wait())!,
            (await withdrawTx.wait())!,
            10,
            vaultTokenBalanceAfterSupply
          );
          const expectedFeeRecipientBalance = feeRecipientVaultTokenBalanceBefore + expectedFee;

          expect(await tokenContract.balanceOf(feeRecipient)).to.equal(
            feeRecipientTokenBalanceBefore
          );
          expect(await vaultToken().balanceOf(feeRecipient)).to.equal(expectedFeeRecipientBalance);
        });
      });
    });

    describe('General tests', () => {
      it('Should emit the correct log on withdraw', async () => {
        const token = 'crvUSD';
        const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
        await fundAccountWithToken(safeAddr, token, amount);
        const strategyId: number = 42;
        const poolId: BytesLike = ethers.keccak256(CURVE_SAVINGS_SCRVUSD_ADDRESS).slice(0, 10);

        await executeAction({
          type: 'CurveSavingsSupply',
          amount,
        });

        const initialVaultTokenBalance = await scrvUSD.balanceOf(safeAddr);

        const tx = await executeAction({
          type: 'CurveSavingsWithdraw',
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
        expect(txLog).to.have.property('balanceBefore');
        expect(txLog).to.have.property('balanceAfter');
        expect(txLog).to.have.property('feeInTokens');
        expect(txLog.balanceBefore).to.equal(initialVaultTokenBalance);
        expect(txLog.balanceAfter).to.be.lt(txLog.balanceBefore);
        expect(txLog.feeInTokens).to.equal(BigInt(0));
      });

      it('Should have withdraw action type', async () => {
        const actionType = await curveSavingsWithdrawContract.actionType();
        expect(actionType).to.equal(actionTypes.WITHDRAW_ACTION);
      });

      it('Should reject invalid token', async () => {
        await expect(
          executeAction({
            type: 'CurveSavingsWithdraw',
            poolAddress: '0x0000000000000000000000000000000000000000',
          })
        ).to.be.revertedWith('GS013');
      });
    });
  });
});
