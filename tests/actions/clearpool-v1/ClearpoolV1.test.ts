import { BytesLike } from 'ethers';
import { network } from 'hardhat';
import { ethers, expect, Signer } from '../..';
import { actionTypes } from '../../actions';
import { tokenConfig } from '../../constants';
import {
  AdminVault,
  ClearpoolV1Supply,
  ClearpoolV1Withdraw,
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
import { fundAccountWithToken, getTokenContract} from '../../utils-stable';

describe.skip('ClearpoolV1 tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let loggerAddress: string;
  let logger: Logger;
  let snapshotId: string;
  let USDC: IERC20;
  let clearpoolV1SupplyContract: ClearpoolV1Supply;
  let clearpoolV1WithdrawContract: ClearpoolV1Withdraw;
  let clearpoolV1SupplyAddress: string;
  let clearpoolV1WithdrawAddress: string;
  let adminVault: AdminVault;

  // Run tests for each supported pool
  const testCases: Array<{
    poolName: string;
    poolAddress: string;
    underlying: keyof typeof tokenConfig;
  }> = [
    {
      poolName: 'ALP',
      poolAddress: tokenConfig.CLEARPOOL_V1_ALP_USDC.address,
      underlying: 'USDC',
    },
    {
      poolName: 'AUR',
      poolAddress: tokenConfig.CLEARPOOL_V1_AUR_USDC.address,
      underlying: 'USDC',
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

    // Fetch USDC token
    USDC = await getTokenContract('USDC');

    // Initialize ClearpoolV1Supply and ClearpoolV1Withdraw actions
    clearpoolV1SupplyContract = await deploy(
      'ClearpoolV1Supply',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    clearpoolV1WithdrawContract = await deploy(
      'ClearpoolV1Withdraw',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    clearpoolV1SupplyAddress = await clearpoolV1SupplyContract.getAddress();
    clearpoolV1WithdrawAddress = await clearpoolV1WithdrawContract.getAddress();

    // grant the ClearpoolV1 pool contracts the POOL_ROLE
    for (const { poolName, poolAddress } of testCases) {
      await adminVault.proposePool('ClearpoolV1', poolAddress);
      await adminVault.addPool('ClearpoolV1', poolAddress);
    }

    // grant the contracts the POOL_ROLE and add actions
    await adminVault.proposeAction(getBytes4(clearpoolV1SupplyAddress), clearpoolV1SupplyAddress);
    await adminVault.proposeAction(getBytes4(clearpoolV1WithdrawAddress), clearpoolV1WithdrawAddress);
    await adminVault.addAction(getBytes4(clearpoolV1SupplyAddress), clearpoolV1SupplyAddress);
    await adminVault.addAction(getBytes4(clearpoolV1WithdrawAddress), clearpoolV1WithdrawAddress);
  });

  beforeEach(async () => {
    log('Taking local snapshot');
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    log('Reverting to local snapshot');
    await network.provider.send('evm_revert', [snapshotId]);
  });

  describe('ClearpoolV1 Supply', () => {
    testCases.forEach(({ poolName, poolAddress, underlying }) => {
      describe(`Testing ${poolName} pool`, () => {
        it('Should deposit', async () => {
          const amount = ethers.parseUnits('2000', tokenConfig[underlying].decimals);
          const tokenContract = await ethers.getContractAt(
            'IERC20',
            tokenConfig[underlying].address
          );
          const poolContract = await ethers.getContractAt('IClearpoolPool', poolAddress);
          await fundAccountWithToken(safeAddr, underlying, amount);

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialPoolBalance = await poolContract.balanceOf(safeAddr);

          await executeAction({
            type: 'ClearpoolV1Supply',
            poolAddress,
            amount,
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalPoolBalance = await poolContract.balanceOf(safeAddr);

          expect(finalTokenBalance).to.be.lt(initialTokenBalance);
          expect(finalPoolBalance).to.be.gt(initialPoolBalance);
        });

        it('Should deposit max', async () => {
          const amount = ethers.parseUnits('2000', tokenConfig[underlying].decimals);
          const tokenContract = await ethers.getContractAt(
            'IERC20',
            tokenConfig[underlying].address
          );
          await fundAccountWithToken(safeAddr, underlying, amount);

          await executeAction({
            type: 'ClearpoolV1Supply',
            poolAddress,
            amount: ethers.MaxUint256.toString(),
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          expect(finalTokenBalance).to.equal('0');
        });

        it('Should take fees on deposit', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[underlying].decimals);
          const tokenContract = await ethers.getContractAt(
            'IERC20',
            tokenConfig[underlying].address
          );
          const poolContract = await ethers.getContractAt('IClearpoolPool', poolAddress);
          await fundAccountWithToken(safeAddr, underlying, amount);

          const feeConfig = await adminVault.feeConfig();
          const feeRecipient = feeConfig.recipient;
          const feeRecipientTokenBalanceBefore = await tokenContract.balanceOf(feeRecipient);
          const feeRecipientPoolBalanceBefore = await poolContract.balanceOf(feeRecipient);

          // Do an initial deposit
          const firstTx = await executeAction({
            type: 'ClearpoolV1Supply',
            poolAddress,
            amount,
            feeBasis: 10,
          });

          const poolBalanceAfterFirstTx = await poolContract.balanceOf(safeAddr);

          // Time travel 2 weeks (maximum allowed for Clearpool)
          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
            safeAddr,
            poolAddress
          );
          const finalFeeTimestamp = (initialFeeTimestamp + BigInt(60 * 60 * 24 * 14)).toString(); // 2 weeks
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp]);

          // Do another deposit to trigger fees
          const secondTx = await executeAction({
            type: 'ClearpoolV1Supply',
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
            poolBalanceAfterFirstTx
          );
          const expectedFeeRecipientBalance = (feeRecipientPoolBalanceBefore + expectedFee).toString();

          expect(await tokenContract.balanceOf(feeRecipient)).to.equal(
            feeRecipientTokenBalanceBefore
          );
          expect(await poolContract.balanceOf(feeRecipient)).to.be.greaterThanOrEqual(
            expectedFeeRecipientBalance
          );
        });
      });
    });

    describe('General tests', () => {
      it('Should emit the correct log on deposit', async () => {
        const amount = ethers.parseUnits('100', tokenConfig.USDC.decimals);
        await fundAccountWithToken(safeAddr, 'USDC', amount);
        const strategyId: number = 42;
        const poolId: BytesLike = ethers.keccak256(tokenConfig.CLEARPOOL_V1_ALP_USDC.address).slice(0, 10);

        const tx = await executeAction({
          type: 'ClearpoolV1Supply',
          poolAddress: tokenConfig.CLEARPOOL_V1_ALP_USDC.address,
          amount: amount.toString(),
        });

        const logs = await decodeLoggerLog(tx);
        log('Logs:', logs);

        expect(logs).to.have.length(1);
        expect(logs[0]).to.have.property('eventId', BigInt(ACTION_LOG_IDS.BALANCE_UPDATE));

        const txLog = logs[0] as BalanceUpdateLog;
        expect(txLog).to.have.property('safeAddress', safeAddr);
        expect(txLog).to.have.property('strategyId', BigInt(strategyId));
        expect(txLog).to.have.property('poolId', poolId);
        expect(txLog).to.have.property('balanceBefore', 0n);
        expect(txLog).to.have.property('balanceAfter');
        expect(txLog).to.have.property('feeInTokens', 0n);
        expect(txLog.balanceAfter).to.be.a('bigint');
        expect(txLog.balanceAfter).to.not.equal(BigInt(0));
      });

      it('Should initialize the last fee timestamp', async () => {
        const lastFeeTimestamp = await adminVault.lastFeeTimestamp(
          safeAddr,
          tokenConfig.CLEARPOOL_V1_ALP_USDC.address
        );
        expect(lastFeeTimestamp).to.equal('0');

        await executeAction({
          type: 'ClearpoolV1Supply',
          poolAddress: tokenConfig.CLEARPOOL_V1_ALP_USDC.address,
          amount: '0',
        });

        const lastFeeTimestampAfter = await adminVault.lastFeeTimestamp(
          safeAddr,
          tokenConfig.CLEARPOOL_V1_ALP_USDC.address
        );
        expect(lastFeeTimestampAfter).to.not.equal('0');
      });

      it('Should have deposit action type', async () => {
        const actionType = await clearpoolV1SupplyContract.actionType();
        expect(actionType).to.equal(actionTypes.DEPOSIT_ACTION);
      });

      it('Should reject invalid token', async () => {
        await expect(
          executeAction({
            type: 'ClearpoolV1Supply',
            poolAddress: '0x0000000000000000000000000000000000000000',
            amount: '1',
          })
        ).to.be.revertedWith('GS013');
      });
    });
  });

  describe('ClearpoolV1 Withdraw', () => {
    beforeEach(async () => {
      // Do empty deposits to initialize the fee timestamps for all pools
      for (const { poolAddress } of testCases) {
        await executeAction({
          type: 'ClearpoolV1Supply',
          poolAddress,
          amount: '0',
        });
      }
    });

    testCases.forEach(({ poolName, poolAddress, underlying }) => {
      describe(`Testing ${poolName} pool`, () => {
        it('Should withdraw', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[underlying].decimals);
          const tokenContract = await ethers.getContractAt(
            'IERC20',
            tokenConfig[underlying].address
          );
          const poolContract = await ethers.getContractAt('IClearpoolPool', poolAddress);

          // Supply first
          await fundAccountWithToken(safeAddr, underlying, amount);
          await executeAction({
            type: 'ClearpoolV1Supply',
            poolAddress,
            amount,
          });

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialPoolBalance = await poolContract.balanceOf(safeAddr);

          await executeAction({
            type: 'ClearpoolV1Withdraw',
            poolAddress,
            amount,
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalPoolBalance = await poolContract.balanceOf(safeAddr);

          expect(finalTokenBalance).to.be.gt(initialTokenBalance);
          expect(finalPoolBalance).to.be.lt(initialPoolBalance);
        });

        it('Should withdraw the maximum amount', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[underlying].decimals);
          const tokenContract = await ethers.getContractAt(
            'IERC20',
            tokenConfig[underlying].address
          );
          const poolContract = await ethers.getContractAt('IClearpoolPool', poolAddress);

          // Supply first
          await fundAccountWithToken(safeAddr, underlying, amount);
          await executeAction({
            type: 'ClearpoolV1Supply',
            poolAddress,
            amount,
          });

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialPoolBalance = await poolContract.balanceOf(safeAddr);
          expect(initialPoolBalance).to.be.gt(0);

          await executeAction({
            type: 'ClearpoolV1Withdraw',
            poolAddress,
            amount: ethers.MaxUint256.toString(),
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalPoolBalance = await poolContract.balanceOf(safeAddr);

          expect(finalTokenBalance).to.be.gt(initialTokenBalance);
          expect(finalPoolBalance).to.equal('0');
        });

        it('Should take fees on withdraw', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[underlying].decimals);
          const tokenContract = await ethers.getContractAt(
            'IERC20',
            tokenConfig[underlying].address
          );
          const poolContract = await ethers.getContractAt('IClearpoolPool', poolAddress);

          const feeConfig = await adminVault.feeConfig();
          const feeRecipient = feeConfig.recipient;
          const feeRecipientTokenBalanceBefore = await tokenContract.balanceOf(feeRecipient);
          const feeRecipientPoolBalanceBefore = await poolContract.balanceOf(feeRecipient);

          // Supply first
          await fundAccountWithToken(safeAddr, underlying, amount);
          const supplyTx = await executeAction({
            type: 'ClearpoolV1Supply',
            poolAddress,
            amount,
            feeBasis: 10,
          });

          const poolBalanceAfterSupply = await poolContract.balanceOf(safeAddr);

          // Time travel 2 weeks (maximum allowed for Clearpool)
          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
            safeAddr,
            poolAddress
          );
          const finalFeeTimestamp = (initialFeeTimestamp + BigInt(60 * 60 * 24 * 14)).toString(); // 2 weeks
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp]);

          const withdrawTx = await executeAction({
            type: 'ClearpoolV1Withdraw',
            poolAddress,
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
            poolBalanceAfterSupply
          );
          const expectedFeeRecipientBalance = (feeRecipientPoolBalanceBefore + expectedFee).toString();

          expect(await tokenContract.balanceOf(feeRecipient)).to.equal(
            feeRecipientTokenBalanceBefore
          );
          expect(await poolContract.balanceOf(feeRecipient)).to.be.greaterThanOrEqual(
            expectedFeeRecipientBalance
          );
        });
      });
    });

    describe('General tests', () => {
      it('Should emit the correct log on withdraw', async () => {
        const token = 'CLEARPOOL_V1_ALP_USDC';
        const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
        await fundAccountWithToken(safeAddr, token, amount);
        const strategyId: number = 42;
        const poolId: BytesLike = ethers.keccak256(tokenConfig[token].address).slice(0, 10);

        const tx = await executeAction({
          type: 'ClearpoolV1Withdraw',
          poolAddress: tokenConfig[token].address,
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
        expect(txLog).to.have.property('feeInTokens', BigInt(0));
        expect(txLog.balanceBefore).to.equal(amount);
        expect(txLog.balanceAfter).to.be.lt(txLog.balanceBefore);
      });

      it('Should have withdraw action type', async () => {
        const actionType = await clearpoolV1WithdrawContract.actionType();
        expect(actionType).to.equal(actionTypes.WITHDRAW_ACTION);
      });

      it('Should reject invalid token', async () => {
        await expect(
          executeAction({
            type: 'ClearpoolV1Withdraw',
            poolAddress: '0x0000000000000000000000000000000000000000',
            amount: '1',
          })
        ).to.be.revertedWith('GS013');
      });

      it('Should not confuse underlying and share tokens', async () => {
        const pool = await ethers.getContractAt('IClearpoolPool', tokenConfig.CLEARPOOL_V1_ALP_USDC.address);
        
        // Fund with excess underlying tokens (1000 USDC)
        const largeAmount = ethers.parseUnits('1000', tokenConfig.USDC.decimals);
        const smallDepositAmount = ethers.parseUnits('100', tokenConfig.USDC.decimals);
        await fundAccountWithToken(safeAddr, 'USDC', largeAmount);
        
        const initialUnderlyingBalance = await USDC.balanceOf(safeAddr);
        expect(initialUnderlyingBalance).to.equal(largeAmount);

        // Deposit smaller amount (100 USDC)
        await executeAction({
          type: 'ClearpoolV1Supply',
          poolAddress: tokenConfig.CLEARPOOL_V1_ALP_USDC.address,
          amount: smallDepositAmount,
        });

        // Verify we still have 900 USDC
        const remainingUnderlying = await USDC.balanceOf(safeAddr);
        expect(remainingUnderlying).to.equal((largeAmount - smallDepositAmount).toString());

        // Get share balance - should represent 100 USDC worth
        const sharesReceived = await pool.balanceOf(safeAddr);

        // Try to withdraw only 10 USDC worth
        const smallWithdrawAmount = ethers.parseUnits('10', tokenConfig.USDC.decimals);
        await executeAction({
          type: 'ClearpoolV1Withdraw',
          poolAddress: tokenConfig.CLEARPOOL_V1_ALP_USDC.address,
          amount: smallWithdrawAmount,
        });

        // Verify balances
        const finalShares = await pool.balanceOf(safeAddr);
        const finalUnderlying = await USDC.balanceOf(safeAddr);
        
        // Should have ~90 worth of shares left (minus any fees/slippage)
        expect(finalShares).to.be.closeTo(
          (sharesReceived - (sharesReceived * smallWithdrawAmount) / smallDepositAmount).toString(),
          ethers.parseUnits('1', tokenConfig.USDC.decimals).toString()
        );
        
        // Should have ~910 USDC (900 + 10 withdrawn)
        expect(finalUnderlying).to.be.closeTo(
          (remainingUnderlying + smallWithdrawAmount).toString(),
          ethers.parseUnits('0.1', tokenConfig.USDC.decimals).toString()
        );
      });
    });
  });
});

export {};
