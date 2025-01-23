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
} from '../../utils';
import { fundAccountWithToken, getDAI, getUSDC, getUSDT } from '../../utils-stable';
import { tokenConfig } from '../../constants';
import {
  AdminVault,
  IYearnVaultV3,
  IERC20,
  YearnV3Supply,
  YearnV3Withdraw,
  Logger,
} from '../../../typechain-types';
import { ACTION_LOG_IDS } from '../../logs';
import { actionTypes } from '../../actions';
import { BytesLike } from 'ethers';
import { BalanceUpdateLog } from '../../logs';

describe('YearnV3 tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let loggerAddress: string;
  let logger: Logger;
  let snapshotId: string;
  let USDC: IERC20;
  let USDT: IERC20;
  let DAI: IERC20;
  let yearnSupplyContract: YearnV3Supply;
  let yearnWithdrawContract: YearnV3Withdraw;
  let yearnSupplyAddress: string;
  let yearnWithdrawAddress: string;
  let yUSDC: IYearnVaultV3;
  let yUSDT: IYearnVaultV3;
  let yDAI: IYearnVaultV3;
  let yajnaDAI: IYearnVaultV3;
  let adminVault: AdminVault;
  const YEARN_DAI_ADDRESS = tokenConfig.YEARN_V3_DAI.address;
  const AJNA_DAI_ADDRESS = tokenConfig.YEARN_V3_AJNA_DAI.address;

  const testCases: Array<{
    token: keyof typeof tokenConfig;
    poolAddress: string;
    yToken: () => IYearnVaultV3;
  }> = [
    {
      token: 'DAI',
      poolAddress: YEARN_DAI_ADDRESS,
      yToken: () => yDAI,
    },
    {
      token: 'DAI',
      poolAddress: AJNA_DAI_ADDRESS,
      yToken: () => yajnaDAI,
    },
    // Add more test cases as needed
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
    USDC = await getUSDC();
    USDT = await getUSDT();
    DAI = await getDAI();

    // Initialize YearnSupply and YearnWithdraw actions
    yearnSupplyContract = await deploy(
      'YearnV3Supply',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    yearnWithdrawContract = await deploy(
      'YearnV3Withdraw',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    yearnSupplyAddress = await yearnSupplyContract.getAddress();
    yearnWithdrawAddress = await yearnWithdrawContract.getAddress();
    yDAI = await ethers.getContractAt('IYearnVaultV3', YEARN_DAI_ADDRESS);
    yajnaDAI = await ethers.getContractAt('IYearnVaultV3', AJNA_DAI_ADDRESS);

    // grant the yToken contracts the POOL_ROLE
    for (const { poolAddress } of testCases) {
      await adminVault.proposePool('YearnV3', poolAddress);
      await adminVault.addPool('YearnV3', poolAddress);
    }

    // Add supply and withdraw actions
    await adminVault.proposeAction(getBytes4(yearnSupplyAddress), yearnSupplyAddress);
    await adminVault.proposeAction(getBytes4(yearnWithdrawAddress), yearnWithdrawAddress);
    await adminVault.addAction(getBytes4(yearnSupplyAddress), yearnSupplyAddress);
    await adminVault.addAction(getBytes4(yearnWithdrawAddress), yearnWithdrawAddress);
  });

  beforeEach(async () => {
    log('Taking local snapshot');
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    log('Reverting to local snapshot');
    await network.provider.send('evm_revert', [snapshotId]);
  });

  describe('YearnV3 Supply', () => {
    testCases.forEach(({ token, poolAddress, yToken }) => {
      describe(`Testing ${token}`, () => {
        it('Should supply', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialyTokenBalance = await yToken().balanceOf(safeAddr);

          await executeAction({
            type: 'YearnV3Supply',
            poolAddress,
            amount,
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalyTokenBalance = await yToken().balanceOf(safeAddr);
          expect(finalTokenBalance).to.be.eq(BigInt(0));
          expect(finalyTokenBalance).to.be.greaterThan(initialyTokenBalance);
        });

        it('Should supply max', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          expect(await tokenContract.balanceOf(safeAddr)).to.equal(amount);

          await executeAction({
            type: 'YearnV3Supply',
            poolAddress,
            amount: ethers.MaxUint256,
          });

          expect(await tokenContract.balanceOf(safeAddr)).to.equal(0);
          expect(await yToken().balanceOf(safeAddr)).to.be.greaterThan(0);
        });

        it('Should take fees on supply', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          const feeConfig = await adminVault.feeConfig();
          const feeRecipient = feeConfig.recipient;
          const feeRecipientTokenBalanceBefore = await tokenContract.balanceOf(feeRecipient);
          const feeRecipientyTokenBalanceBefore = await yToken().balanceOf(feeRecipient);

          const firstTx = await executeAction({
            type: 'YearnV3Supply',
            poolAddress,
            amount,
            feeBasis: 10,
          });

          const firstTxReceipt = await firstTx.wait();
          if (!firstTxReceipt) throw new Error('Transaction failed');

          const yTokenBalanceAfterFirstTx = await yToken().balanceOf(safeAddr);

          // Time travel 1 year
          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
            safeAddr,
            poolAddress
          );
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          const secondTx = await executeAction({
            type: 'YearnV3Supply',
            poolAddress,
            amount: '0',
            feeBasis: 10,
          });
          const secondTxReceipt = await secondTx.wait();
          if (!secondTxReceipt) throw new Error('Transaction failed');

          const expectedFee = await calculateExpectedFee(
            firstTxReceipt,
            secondTxReceipt,
            10,
            yTokenBalanceAfterFirstTx
          );
          const expectedFeeRecipientBalance = feeRecipientyTokenBalanceBefore + expectedFee;

          expect(await tokenContract.balanceOf(feeRecipient)).to.equal(
            feeRecipientTokenBalanceBefore
          );
          expect(await yToken().balanceOf(feeRecipient)).to.equal(expectedFeeRecipientBalance);
        });
      });
    });

    describe('General tests', () => {
      it('Should emit the correct log on supply', async () => {
        const token = 'DAI';
        const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
        await fundAccountWithToken(safeAddr, token, amount);
        const strategyId: number = 42;
        const poolId: BytesLike = ethers.keccak256(YEARN_DAI_ADDRESS).slice(0, 10);

        const tx = await executeAction({
          type: 'YearnV3Supply',
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
          YEARN_DAI_ADDRESS
        );
        expect(initialLastFeeTimestamp).to.equal(0n);

        await executeAction({
          type: 'YearnV3Supply',
          poolAddress: YEARN_DAI_ADDRESS,
          amount: '0',
        });

        const finalLastFeeTimestamp = await adminVault.lastFeeTimestamp(
          safeAddr,
          YEARN_DAI_ADDRESS
        );
        expect(finalLastFeeTimestamp).to.not.equal(0n);
      });

      it('Should have supply action type', async () => {
        const actionType = await yearnSupplyContract.actionType();
        expect(actionType).to.equal(actionTypes.DEPOSIT_ACTION);
      });

      it('Should reject invalid token', async () => {
        await expect(
          executeAction({
            type: 'YearnV3Supply',
            poolAddress: '0x0000000000000000000000000000000000000000',
            amount: '1',
          })
        ).to.be.revertedWith('GS013');
      });

      it('Should not confuse underlying and share tokens', async () => {
        const pool = await ethers.getContractAt('IYearnVaultV3', YEARN_DAI_ADDRESS);
        
        // Fund with excess underlying tokens (1000 DAI)
        const largeAmount = ethers.parseUnits('1000', tokenConfig.DAI.decimals);
        const smallDepositAmount = ethers.parseUnits('100', tokenConfig.DAI.decimals);
        await fundAccountWithToken(safeAddr, 'DAI', largeAmount);
        
        const initialUnderlyingBalance = await DAI.balanceOf(safeAddr);
        expect(initialUnderlyingBalance).to.equal(largeAmount);

        // Deposit smaller amount (100 DAI)
        await executeAction({
          type: 'YearnV3Supply',
          poolAddress: YEARN_DAI_ADDRESS,
          amount: smallDepositAmount,
        });

        // Verify we still have 900 DAI
        const remainingUnderlying = await DAI.balanceOf(safeAddr);
        expect(remainingUnderlying).to.equal(largeAmount - smallDepositAmount);

        // Get share balance - should represent 100 DAI worth
        const sharesReceived = await pool.balanceOf(safeAddr);

        // Try to withdraw only 10 DAI worth
        const smallWithdrawAmount = ethers.parseUnits('10', tokenConfig.DAI.decimals);
        await executeAction({
          type: 'YearnV3Withdraw',
          poolAddress: YEARN_DAI_ADDRESS,
          amount: smallWithdrawAmount,
        });

        // Verify balances
        const finalShares = await pool.balanceOf(safeAddr);
        const finalUnderlying = await DAI.balanceOf(safeAddr);
        
        // Should have ~90 worth of shares left (minus any fees/slippage)
        const expectedSharesBurned = await pool.convertToShares(smallWithdrawAmount);
        expect(finalShares).to.be.closeTo(
          sharesReceived - expectedSharesBurned,
          ethers.parseUnits('1', tokenConfig.DAI.decimals)  // Much smaller tolerance since we're using exact conversion
        );
        
        // Should have ~910 DAI (900 + 10 withdrawn)
        expect(finalUnderlying).to.be.closeTo(
          remainingUnderlying + smallWithdrawAmount,
          ethers.parseUnits('0.1', tokenConfig.DAI.decimals)
        );
      });
    });
  });

  describe('YearnV3 Withdraw', () => {
    beforeEach(async () => {
      // Initialize the fee timestamp for all pools
      for (const { poolAddress } of testCases) {
        await executeAction({
          type: 'YearnV3Supply',
          poolAddress,
          amount: '0',
        });
      }
    });

    testCases.forEach(({ token, poolAddress, yToken }) => {
      describe(`Testing ${token}`, () => {
        it('Should withdraw', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          // Supply first
          await executeAction({
            type: 'YearnV3Supply',
            poolAddress,
            amount,
          });

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialYearnBalance = await yToken().balanceOf(safeAddr);

          await executeAction({
            type: 'YearnV3Withdraw',
            poolAddress,
            amount,
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalYearnBalance = await yToken().balanceOf(safeAddr);

          expect(finalTokenBalance).to.be.gt(initialTokenBalance);
          expect(finalYearnBalance).to.be.lt(initialYearnBalance);
        });

        it('Should withdraw the maximum amount', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          // Supply first
          await executeAction({
            type: 'YearnV3Supply',
            poolAddress,
            amount,
          });

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialYearnBalance = await yToken().balanceOf(safeAddr);
          expect(initialYearnBalance).to.be.gt(0);

          await executeAction({
            type: 'YearnV3Withdraw',
            poolAddress,
            amount: ethers.MaxUint256,
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalYearnBalance = await yToken().balanceOf(safeAddr);

          expect(finalTokenBalance).to.be.gt(initialTokenBalance);
          expect(finalYearnBalance).to.equal(0);
        });

        it('Should take fees on withdraw', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          const feeConfig = await adminVault.feeConfig();
          const feeRecipient = feeConfig.recipient;
          const feeRecipientTokenBalanceBefore = await tokenContract.balanceOf(feeRecipient);
          const feeRecipientyTokenBalanceBefore = await yToken().balanceOf(feeRecipient);

          // Supply first
          const supplyTx = await executeAction({
            type: 'YearnV3Supply',
            poolAddress,
            amount,
            feeBasis: 10,
          });

          const yTokenBalanceAfterSupply = await yToken().balanceOf(safeAddr);

          // Time travel 1 year
          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
            safeAddr,
            poolAddress
          );
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          // Withdraw to trigger fees
          const withdrawTx = await executeAction({
            type: 'YearnV3Withdraw',
            poolAddress,
            amount: '1',
            feeBasis: 10,
          });

          const expectedFee = await calculateExpectedFee(
            (await supplyTx.wait())!,
            (await withdrawTx.wait())!,
            10,
            yTokenBalanceAfterSupply
          );
          const expectedFeeRecipientBalance = feeRecipientyTokenBalanceBefore + expectedFee;

          expect(await tokenContract.balanceOf(feeRecipient)).to.equal(
            feeRecipientTokenBalanceBefore
          );
          expect(await yToken().balanceOf(feeRecipient)).to.equal(expectedFeeRecipientBalance);
        });
      });
    });

    describe('General tests', () => {
      it('Should emit the correct log on withdraw', async () => {
        const token = 'DAI';
        const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
        await fundAccountWithToken(safeAddr, token, amount);
        const strategyId: number = 42;
        const poolId: BytesLike = ethers.keccak256(YEARN_DAI_ADDRESS).slice(0, 10);

        await executeAction({
          type: 'YearnV3Supply',
          amount,
        });

        const initialyTokenBalance = await yDAI.balanceOf(safeAddr);

        const tx = await executeAction({
          type: 'YearnV3Withdraw',
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
        expect(txLog.balanceBefore).to.equal(initialyTokenBalance);
        expect(txLog.balanceAfter).to.be.lt(txLog.balanceBefore);
        expect(txLog.feeInTokens).to.equal(BigInt(0));
      });

      it('Should have withdraw action type', async () => {
        const actionType = await yearnWithdrawContract.actionType();
        expect(actionType).to.equal(actionTypes.WITHDRAW_ACTION);
      });

      it('Should reject invalid token', async () => {
        await expect(
          executeAction({
            type: 'YearnV3Withdraw',
            poolAddress: '0x0000000000000000000000000000000000000000',
          })
        ).to.be.revertedWith('GS013');
      });
    });
  });
});
