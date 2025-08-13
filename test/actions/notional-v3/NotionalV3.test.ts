import { BytesLike } from 'ethers';
import { network } from 'hardhat';
import { ethers, expect, Signer } from '../..';
import { actionTypes } from '../../actions';
import { tokenConfig } from '../../constants';
import {
  AdminVault,
  NotionalV3Supply,
  NotionalV3Withdraw,
  IERC20,
  INotionalPToken,
  Logger,
} from '../../../typechain-types';
import { ACTION_LOG_IDS, BalanceUpdateLog } from '../../logs';
import {
  calculateExpectedFee,
  decodeLoggerLog,
  deploy,
  executeAction,
  getBaseSetup,
  getTypedContract,
  log,
  getBytes4,
} from '../../utils';
import { fundAccountWithToken } from '../../utils-stable';

describe('Notional tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let loggerAddress: string;
  let logger: Logger;
  let snapshotId: string;
  let USDC: IERC20;
  let notionalV3USDC: INotionalPToken;
  let NotionalV3SupplyContract: NotionalV3Supply;
  let NotionalV3WithdrawContract: NotionalV3Withdraw;
  let NotionalV3SupplyAddress: string;
  let NotionalV3WithdrawAddress: string;
  let adminVault: AdminVault;
  const NOTIONAL_ROUTER = '0x6e7058c91F85E0F6db4fc9da2CA41241f5e4263f';
  const NOTIONAL_V3_USDC_ADDRESS = tokenConfig.NOTIONAL_V3_USDC.address;

  // Run tests for each supported token
  const testCases: Array<{
    token: keyof typeof tokenConfig;
    poolAddress: string;
    pToken: () => INotionalPToken;
  }> = [
    {
      token: 'USDC',
      poolAddress: NOTIONAL_V3_USDC_ADDRESS,
      pToken: () => notionalV3USDC,
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

    // Fetch the USDC token
    USDC = await getTypedContract<IERC20>('IERC20', tokenConfig.USDC.address);
    notionalV3USDC = await getTypedContract<INotionalPToken>(
      'INotionalPToken',
      NOTIONAL_V3_USDC_ADDRESS
    );

    // Initialize NotionalV3Supply and NotionalV3Withdraw actions
    NotionalV3SupplyContract = await deploy(
      'NotionalV3Supply',
      signer,
      await adminVault.getAddress(),
      loggerAddress,
      NOTIONAL_ROUTER
    );
    NotionalV3WithdrawContract = await deploy(
      'NotionalV3Withdraw',
      signer,
      await adminVault.getAddress(),
      loggerAddress,
      NOTIONAL_ROUTER
    );
    NotionalV3SupplyAddress = await NotionalV3SupplyContract.getAddress();
    NotionalV3WithdrawAddress = await NotionalV3WithdrawContract.getAddress();

    // Register actions
    await adminVault.proposeAction(getBytes4(NotionalV3SupplyAddress), NotionalV3SupplyAddress);
    await adminVault.addAction(getBytes4(NotionalV3SupplyAddress), NotionalV3SupplyAddress);
    await adminVault.proposeAction(getBytes4(NotionalV3WithdrawAddress), NotionalV3WithdrawAddress);
    await adminVault.addAction(getBytes4(NotionalV3WithdrawAddress), NotionalV3WithdrawAddress);

    // Add pUSDC to supported pools
    await adminVault.proposePool('NotionalV3', NOTIONAL_V3_USDC_ADDRESS);
    await adminVault.addPool('NotionalV3', NOTIONAL_V3_USDC_ADDRESS);
  });

  beforeEach(async () => {
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    await network.provider.send('evm_revert', [snapshotId]);
  });

  describe('Notional Supply', () => {
    testCases.forEach(({ token, poolAddress, pToken }) => {
      describe(`Testing ${token}`, () => {
        it('Should deposit', async () => {
          const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialNotionalBalance = await pToken().balanceOf(safeAddr);

          await executeAction({
            type: 'NotionalV3Supply',
            amount,
            minSharesReceived: '0',
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalNotionalBalance = await pToken().balanceOf(safeAddr);

          expect(finalTokenBalance).to.equal(initialTokenBalance - amount);
          expect(finalNotionalBalance).to.be.greaterThan(initialNotionalBalance);
        });

        it('Should deposit max', async () => {
          const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialNotionalBalance = await pToken().balanceOf(safeAddr);

          expect(initialTokenBalance).to.equal(amount);

          await executeAction({
            type: 'NotionalV3Supply',
            poolAddress,
            amount: ethers.MaxUint256,
            minSharesReceived: '0',
          });

          expect(await tokenContract.balanceOf(safeAddr)).to.equal(0);
          expect(await pToken().balanceOf(safeAddr)).to.be.greaterThan(initialNotionalBalance);
        });

        it('Should take fees on deposit', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          const feeConfig = await adminVault.feeConfig();
          const feeRecipient = feeConfig.recipient;
          const feeRecipientTokenBalanceBefore = await tokenContract.balanceOf(feeRecipient);
          const feeRecipientNotionalBalanceBefore = await pToken().balanceOf(feeRecipient);

          // Do an initial deposit
          const firstTx = await executeAction({
            type: 'NotionalV3Supply',
            poolAddress,
            amount,
            minSharesReceived: '0',
            feeBasis: 10,
          });

          const notionalBalanceAfterFirstTx = await pToken().balanceOf(safeAddr);

          // Time travel 1 year
          const protocolId = BigInt(
            ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['string'], ['NotionalV3']))
          );
          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(safeAddr, poolAddress);
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          // Do another deposit to trigger fees
          const secondTx = await executeAction({
            type: 'NotionalV3Supply',
            poolAddress,
            amount: '0',
            minSharesReceived: '0',
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
            notionalBalanceAfterFirstTx
          );
          const expectedFeeRecipientBalance = feeRecipientNotionalBalanceBefore + expectedFee;

          // Check fees were taken in pTokens, not underlying
          expect(await tokenContract.balanceOf(feeRecipient)).to.equal(
            feeRecipientTokenBalanceBefore
          );
          expect(await pToken().balanceOf(feeRecipient)).to.equal(expectedFeeRecipientBalance);
        });
      });
    });

    describe('General tests', () => {
      it('Should emit the correct log on deposit', async () => {
        const token = 'USDC';
        const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
        await fundAccountWithToken(safeAddr, token, amount);
        const strategyId: number = 42;
        const poolId: BytesLike = ethers.keccak256(NOTIONAL_V3_USDC_ADDRESS).slice(0, 10);

        const tx = await executeAction({
          type: 'NotionalV3Supply',
          amount,
          minSharesReceived: '0',
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
          ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['string'], ['NotionalV3']))
        );
        const initialLastFeeTimestamp = await adminVault.lastFeeTimestamp(
          safeAddr,
          NOTIONAL_V3_USDC_ADDRESS
        );
        expect(initialLastFeeTimestamp).to.equal(BigInt(0));

        await fundAccountWithToken(safeAddr, 'USDC', 1000);

        const tx = await executeAction({
          type: 'NotionalV3Supply',
          minSharesReceived: '0',
          amount: '0',
        });

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
          NOTIONAL_V3_USDC_ADDRESS
        );
        expect(finalLastFeeTimestamp).to.equal(BigInt(block.timestamp));
      });

      it('Should have deposit action type', async () => {
        const actionType = await NotionalV3SupplyContract.actionType();
        expect(actionType).to.equal(actionTypes.DEPOSIT_ACTION);
      });

      it('Should reject invalid token', async () => {
        await expect(
          executeAction({
            type: 'NotionalV3Supply',
            amount: '0',
            poolAddress: '0x0000000000000000000000000000000000000000',
            minSharesReceived: '0',
          })
        ).to.be.revertedWith('GS013');
      });
    });
  });

  describe('Notional Withdraw', () => {
    beforeEach(async () => {
      // Do an empty deposit to initialize the fee timestamp
      for (const { poolAddress } of testCases) {
        await executeAction({
          type: 'NotionalV3Supply',
          poolAddress,
          amount: '0',
          minSharesReceived: '0',
        });
      }
    });

    testCases.forEach(({ token, poolAddress, pToken }) => {
      describe(`Testing ${token}`, () => {
        it('Should withdraw', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);

          // First supply to have something to withdraw
          await fundAccountWithToken(safeAddr, token, amount);
          await executeAction({
            type: 'NotionalV3Supply',
            poolAddress,
            amount,
            minSharesReceived: '0',
          });

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialNotionalBalance = await pToken().balanceOf(safeAddr);

          // Get expected underlying for half the shares
          const sharesToBurn = initialNotionalBalance / BigInt(2);
          const expectedUnderlying = await pToken().previewRedeem(sharesToBurn);

          await executeAction({
            type: 'NotionalV3Withdraw',
            poolAddress,
            sharesToBurn: sharesToBurn.toString(),
            minUnderlyingReceived: expectedUnderlying.toString(),
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalNotionalBalance = await pToken().balanceOf(safeAddr);

          expect(finalTokenBalance).to.be.greaterThan(initialTokenBalance);
          expect(finalNotionalBalance).to.equal(initialNotionalBalance - sharesToBurn);
        });

        it('Should withdraw the maximum amount', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);

          // First supply to have something to withdraw
          await fundAccountWithToken(safeAddr, token, amount);
          await executeAction({
            type: 'NotionalV3Supply',
            poolAddress,
            amount,
            minSharesReceived: '0',
          });

          const initialNotionalBalance = await pToken().balanceOf(safeAddr);
          expect(initialNotionalBalance).to.be.gt(0);

          // Get expected underlying for all shares
          const expectedUnderlying = await pToken().previewRedeem(initialNotionalBalance);

          await executeAction({
            type: 'NotionalV3Withdraw',
            poolAddress,
            sharesToBurn: ethers.MaxUint256.toString(),
            minUnderlyingReceived: expectedUnderlying.toString(),
          });

          // Notional leaves some dust in the vault, so we expect to have less than 1 shares worth left behind
          const minWithdraw = await pToken().exchangeRate();
          expect(await pToken().balanceOf(safeAddr)).to.be.lessThan(minWithdraw);
          expect(await tokenContract.balanceOf(safeAddr)).to.be.greaterThan(0);
        });

        it('Should take fees on withdraw', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          await fundAccountWithToken(safeAddr, token, amount);

          const feeConfig = await adminVault.feeConfig();
          const feeRecipient = feeConfig.recipient;
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          const feeRecipientTokenBalanceBefore = await tokenContract.balanceOf(feeRecipient);
          const feeRecipientNotionalBalanceBefore = await pToken().balanceOf(feeRecipient);

          const supplyTx = await executeAction({
            type: 'NotionalV3Supply',
            amount,
            minSharesReceived: '0',
            feeBasis: 10,
          });

          const notionalBalanceAfterSupply = await pToken().balanceOf(safeAddr);

          const protocolId = BigInt(
            ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['string'], ['NotionalV3']))
          );
          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(safeAddr, poolAddress);
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          // Withdraw a small amount of shares
          const sharesToBurn = notionalBalanceAfterSupply / BigInt(10); // 10% of shares
          const expectedUnderlying = await pToken().previewRedeem(sharesToBurn);

          const withdrawTx = await executeAction({
            type: 'NotionalV3Withdraw',
            poolAddress,
            sharesToBurn: sharesToBurn.toString(),
            minUnderlyingReceived: expectedUnderlying.toString(),
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
            notionalBalanceAfterSupply
          );
          const expectedFeeRecipientBalance = feeRecipientNotionalBalanceBefore + expectedFee;

          expect(await tokenContract.balanceOf(feeRecipient)).to.equal(
            feeRecipientTokenBalanceBefore
          );
          expect(await pToken().balanceOf(feeRecipient)).to.be.greaterThanOrEqual(
            expectedFeeRecipientBalance
          );
        });
      });
    });

    describe('General tests', () => {
      it('Should emit the correct log on withdraw', async () => {
        const token = 'USDC';
        const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
        const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
        const strategyId: number = 42;
        const poolId: BytesLike = ethers.keccak256(NOTIONAL_V3_USDC_ADDRESS).slice(0, 10);

        // First supply to have something to withdraw
        await fundAccountWithToken(safeAddr, token, amount);
        await executeAction({
          type: 'NotionalV3Supply',
          amount,
          minSharesReceived: '0',
        });

        const initialBalance = await notionalV3USDC.balanceOf(safeAddr);
        const expectedUnderlying = await notionalV3USDC.previewRedeem(initialBalance);

        const tx = await executeAction({
          type: 'NotionalV3Withdraw',
          sharesToBurn: ethers.MaxUint256.toString(),
          minUnderlyingReceived: expectedUnderlying.toString(),
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
      });

      it('Should have withdraw action type', async () => {
        const actionType = await NotionalV3WithdrawContract.actionType();
        expect(actionType).to.equal(actionTypes.WITHDRAW_ACTION);
      });

      it('Should reject invalid token', async () => {
        await expect(
          executeAction({
            type: 'NotionalV3Withdraw',
            poolAddress: '0x0000000000000000000000000000000000000000',
            sharesToBurn: '1',
            minUnderlyingReceived: '1',
          })
        ).to.be.revertedWith('GS013');
      });

      it('Should not confuse underlying and share tokens', async () => {
        const pool = await ethers.getContractAt('INotionalPToken', NOTIONAL_V3_USDC_ADDRESS);

        // Fund with excess underlying tokens (1000 USDC)
        const largeAmount = ethers.parseUnits('1000', tokenConfig.USDC.decimals);
        const smallDepositAmount = ethers.parseUnits('100', tokenConfig.USDC.decimals);
        await fundAccountWithToken(safeAddr, 'USDC', largeAmount);

        const initialUnderlyingBalance = await USDC.balanceOf(safeAddr);
        expect(initialUnderlyingBalance).to.equal(largeAmount);

        // Deposit smaller amount (100 USDC)
        await executeAction({
          type: 'NotionalV3Supply',
          poolAddress: NOTIONAL_V3_USDC_ADDRESS,
          amount: smallDepositAmount,
          minSharesReceived: '0',
        });

        // Verify we still have 900 USDC
        const remainingUnderlying = await USDC.balanceOf(safeAddr);
        expect(remainingUnderlying).to.equal(largeAmount - smallDepositAmount);

        // Get share balance - should represent 100 USDC worth
        const sharesReceived = await pool.balanceOf(safeAddr);

        // Try to withdraw 10% of shares
        const sharesToWithdraw = sharesReceived / BigInt(10);
        const expectedUnderlying = await pool.previewRedeem(sharesToWithdraw);

        await executeAction({
          type: 'NotionalV3Withdraw',
          poolAddress: NOTIONAL_V3_USDC_ADDRESS,
          sharesToBurn: sharesToWithdraw.toString(),
          minUnderlyingReceived: expectedUnderlying.toString(),
        });

        // Verify balances
        const finalShares = await pool.balanceOf(safeAddr);
        const finalUnderlying = await USDC.balanceOf(safeAddr);

        expect(finalShares).to.equal(sharesReceived - sharesToWithdraw);

        // Should have received the expected underlying amount
        expect(finalUnderlying).to.be.closeTo(
          remainingUnderlying + expectedUnderlying,
          ethers.parseUnits('0.1', tokenConfig.USDC.decimals)
        );
      });
    });
  });
});
