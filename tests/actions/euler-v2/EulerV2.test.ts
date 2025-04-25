import { BytesLike } from 'ethers';
import { network } from 'hardhat';
import { ethers, expect, Signer } from '../..';
import { actionTypes } from '../../actions';
import { tokenConfig } from '../../constants';
import {
  AdminVault,
  EulerV2Supply,
  EulerV2Withdraw,
  IERC20,
  IEulerV2Lending,
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
import { fundAccountWithToken, getUSDC, getUSDT, getUSDE } from '../../utils-stable';

describe('EulerV2 tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let loggerAddress: string;
  let logger: Logger;
  let snapshotId: string;
  let USDC: IERC20;
  let USDT: IERC20;
  let USDE: IERC20;
  let eulerSupplyContract: EulerV2Supply;
  let eulerWithdrawContract: EulerV2Withdraw;
  let eulerSupplyAddress: string;
  let eulerWithdrawAddress: string;
  let ePrimeUSDC: IEulerV2Lending;
  let eYieldUSDC: IEulerV2Lending;
  let eYieldUSDT: IEulerV2Lending;
  let eYieldUSDE: IEulerV2Lending;
  let eMaxiUSDC: IEulerV2Lending;
  let eResolvUSDC: IEulerV2Lending;
  let adminVault: AdminVault;

  // Run tests for each supported pool
  const testCases: Array<{
    poolName: string;
    poolAddress: string;
    underlying: keyof typeof tokenConfig;
    eToken: () => IEulerV2Lending;
  }> = [
    {
      poolAddress: tokenConfig.EULER_V2_PRIME_USDC.address,
      eToken: () => ePrimeUSDC,
      poolName: 'Prime USDC',
      underlying: 'USDC',
    },
    {
      poolAddress: tokenConfig.EULER_V2_YIELD_USDC.address,
      eToken: () => eYieldUSDC,
      poolName: 'Yield USDC',
      underlying: 'USDC',
    },
    {
      poolAddress: tokenConfig.EULER_V2_YIELD_USDT.address,
      eToken: () => eYieldUSDT,
      poolName: 'Yield USDT',
      underlying: 'USDT',
    },
    {
      poolAddress: tokenConfig.EULER_V2_YIELD_USDE.address,
      eToken: () => eYieldUSDE,
      poolName: 'Yield USDE',
      underlying: 'USDE',
    },
    {
      poolAddress: tokenConfig.EULER_V2_MAXI_USDC.address,
      eToken: () => eMaxiUSDC,
      poolName: 'Stablecoin Maxi USDC',
      underlying: 'USDC',
    },
    {
      poolAddress: tokenConfig.EULER_V2_RESOLV_USDC.address,
      eToken: () => eResolvUSDC,
      poolName: 'Resolv USDC',
      underlying: 'USDC',
    },
  ];

  before(async () => {
    [signer] = await ethers.getSigners();
    const baseSetup = await getBaseSetup(signer);
    if (!baseSetup) {
      throw new Error('Failed to deploy base setup contracts');
    }
    safeAddr = (await baseSetup.safe.getAddress()) as string;
    loggerAddress = (await baseSetup.logger.getAddress()) as string;
    logger = await ethers.getContractAt('Logger', loggerAddress);
    adminVault = await baseSetup.adminVault;
    
    // Fetch the tokens
    USDC = await getUSDC();
    USDT = await getUSDT();
    USDE = await getUSDE();

    // Initialize EulerV2Supply and EulerV2Withdraw actions
    eulerSupplyContract = await deploy(
      'EulerV2Supply',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    eulerWithdrawContract = await deploy(
      'EulerV2Withdraw',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    eulerSupplyAddress = await eulerSupplyContract.getAddress();
    eulerWithdrawAddress = await eulerWithdrawContract.getAddress();

    // Initialize Euler lending contracts
    ePrimeUSDC = await ethers.getContractAt('IEulerV2Lending', tokenConfig.EULER_V2_PRIME_USDC.address);
    eYieldUSDC = await ethers.getContractAt('IEulerV2Lending', tokenConfig.EULER_V2_YIELD_USDC.address);
    eYieldUSDT = await ethers.getContractAt('IEulerV2Lending', tokenConfig.EULER_V2_YIELD_USDT.address);
    eYieldUSDE = await ethers.getContractAt('IEulerV2Lending', tokenConfig.EULER_V2_YIELD_USDE.address);
    eMaxiUSDC = await ethers.getContractAt('IEulerV2Lending', tokenConfig.EULER_V2_MAXI_USDC.address);
    eResolvUSDC = await ethers.getContractAt('IEulerV2Lending', tokenConfig.EULER_V2_RESOLV_USDC.address);

    // Grant the Euler contracts the POOL_ROLE
    await adminVault.proposePool('EulerV2', tokenConfig.EULER_V2_PRIME_USDC.address);
    await adminVault.proposePool('EulerV2', tokenConfig.EULER_V2_YIELD_USDC.address);
    await adminVault.proposePool('EulerV2', tokenConfig.EULER_V2_YIELD_USDT.address);
    await adminVault.proposePool('EulerV2', tokenConfig.EULER_V2_YIELD_USDE.address);
    await adminVault.proposePool('EulerV2', tokenConfig.EULER_V2_MAXI_USDC.address);
    await adminVault.proposePool('EulerV2', tokenConfig.EULER_V2_RESOLV_USDC.address);
    await adminVault.addPool('EulerV2', tokenConfig.EULER_V2_PRIME_USDC.address);
    await adminVault.addPool('EulerV2', tokenConfig.EULER_V2_YIELD_USDC.address);
    await adminVault.addPool('EulerV2', tokenConfig.EULER_V2_YIELD_USDT.address);
    await adminVault.addPool('EulerV2', tokenConfig.EULER_V2_YIELD_USDE.address);
    await adminVault.addPool('EulerV2', tokenConfig.EULER_V2_MAXI_USDC.address);
    await adminVault.addPool('EulerV2', tokenConfig.EULER_V2_RESOLV_USDC.address);
  });

  beforeEach(async () => {
    log('Taking local snapshot');
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    log('Reverting to local snapshot');
    await network.provider.send('evm_revert', [snapshotId]);
  });

  describe('EulerV2 Supply', () => {
    testCases.forEach(({ poolName, poolAddress, underlying, eToken }) => {
      describe(`Testing ${poolName}`, () => {
        it('Should deposit', async () => {
          const amount = ethers.parseUnits('2000', tokenConfig[underlying].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[underlying].address);
          await fundAccountWithToken(safeAddr, underlying, amount);

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialEulerBalance = await eToken().balanceOf(safeAddr);

          await executeAction({
            type: 'EulerV2Supply',
            poolAddress,
            amount,
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalETokenBalance = await eToken().balanceOf(safeAddr);

          expect(finalTokenBalance).to.equal(initialTokenBalance - amount);
          expect(finalETokenBalance).to.be.greaterThan(initialEulerBalance);
        });

        it('Should deposit max', async () => {
          const amount = ethers.parseUnits('2000', tokenConfig[underlying].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[underlying].address);
          await fundAccountWithToken(safeAddr, underlying, amount);

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialEulerBalance = await eToken().balanceOf(safeAddr);

          expect(initialTokenBalance).to.equal(amount);

          await executeAction({
            type: 'EulerV2Supply',
            poolAddress,
            amount: ethers.MaxUint256,
          });

          expect(await tokenContract.balanceOf(safeAddr)).to.equal(0);
          expect(await eToken().balanceOf(safeAddr)).to.be.greaterThan(initialEulerBalance);
        });

        it('Should take fees on deposit', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[underlying].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[underlying].address);
          await fundAccountWithToken(safeAddr, underlying, amount);

          const feeConfig = await adminVault.feeConfig();
          const feeRecipient = feeConfig.recipient;
          const feeRecipientTokenBalanceBefore = await tokenContract.balanceOf(feeRecipient);
          const feeRecipientETokenBalanceBefore = await eToken().balanceOf(feeRecipient);

          // Do an initial deposit
          const firstTx = await executeAction({
            type: 'EulerV2Supply',
            poolAddress,
            amount,
            feeBasis: 10,
          });

          const eTokenBalanceAfterFirstTx = await eToken().balanceOf(safeAddr);

          // Time travel 1 year
          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
            safeAddr,
            poolAddress
          );
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          // Do another deposit to trigger fees
          const secondTx = await executeAction({
            type: 'EulerV2Supply',
            poolAddress,
            amount: '0',
            feeBasis: 10,
          });

          const firstTxReceipt = await firstTx.wait();
          if (!firstTxReceipt) throw new Error('First deposit transaction failed to get receipt');

          const secondTxReceipt = await secondTx.wait();
          if (!secondTxReceipt) throw new Error('Second deposit transaction failed to get receipt');

          // Calculate expected fee
          const expectedFee = await calculateExpectedFee(
            firstTxReceipt,
            secondTxReceipt,
            10,
            eTokenBalanceAfterFirstTx
          );
          const expectedFeeRecipientBalance = feeRecipientETokenBalanceBefore + expectedFee;

          expect(await tokenContract.balanceOf(feeRecipient)).to.equal(feeRecipientTokenBalanceBefore);
          expect(await eToken().balanceOf(feeRecipient)).to.equal(expectedFeeRecipientBalance);
        });
      });
    });

    describe('General tests', () => {
      it('Should emit the correct log on deposit', async () => {
        const token = 'USDC';
        const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
        await fundAccountWithToken(safeAddr, token, amount);
        const strategyId = BigInt(42);
        const poolId: BytesLike = ethers.keccak256(tokenConfig.EULER_V2_PRIME_USDC.address).slice(0, 10);

        const tx = await executeAction({
          type: 'EulerV2Supply',
          poolAddress: tokenConfig.EULER_V2_PRIME_USDC.address,
          amount,
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
        expect(txLog).to.have.property('strategyId', strategyId);
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
          tokenConfig.EULER_V2_PRIME_USDC.address
        );
        expect(initialLastFeeTimestamp).to.equal(BigInt(0));

        await fundAccountWithToken(safeAddr, 'USDC', 1000);

        const tx = await executeAction({
          type: 'EulerV2Supply',
          poolAddress: tokenConfig.EULER_V2_PRIME_USDC.address,
          amount: '1000',
        });

        const txReceipt = await tx.wait();
        if (!txReceipt) {
          throw new Error('Transaction receipt not found');
        }
        const block = await ethers.provider.getBlock(txReceipt.blockNumber);
        if (!block) {
          throw new Error('Failed to fetch block information for timestamp verification');
        }
        const finalLastFeeTimestamp = await adminVault.lastFeeTimestamp(
          safeAddr,
          tokenConfig.EULER_V2_PRIME_USDC.address
        );
        expect(finalLastFeeTimestamp).to.equal(BigInt(block.timestamp));
      });

      it('Should have deposit action type', async () => {
        const actionType = await eulerSupplyContract.actionType();
        expect(actionType).to.equal(actionTypes.DEPOSIT_ACTION);
      });

      it('Should reject invalid token', async () => {
        await expect(
          executeAction({
            type: 'EulerV2Supply',
            poolAddress: '0x0000000000000000000000000000000000000000',
          })
        ).to.be.revertedWith('GS013'); // Invalid target contract address
      });
    });
  });

  describe('EulerV2 Withdraw', () => {
    beforeEach(async () => {
      // Do empty deposits to initialize the fee timestamps for all pools
      for (const { poolAddress } of testCases) {
        await executeAction({
          type: 'EulerV2Supply',
          poolAddress,
          amount: '0',
        });
      }
    });

    testCases.forEach(({ poolName, poolAddress, underlying, eToken }) => {
      describe(`Testing ${poolName}`, () => {
        it('Should withdraw', async () => {
          // First deposit to have something to withdraw
          const amount = ethers.parseUnits('2000', tokenConfig[underlying].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[underlying].address);
          await fundAccountWithToken(safeAddr, underlying, amount);

          await executeAction({
            type: 'EulerV2Supply',
            poolAddress,
            amount,
          });

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialETokenBalance = await eToken().balanceOf(safeAddr);

          const withdrawAmount = ethers.parseUnits('1000', tokenConfig[underlying].decimals);
          await executeAction({
            type: 'EulerV2Withdraw',
            poolAddress,
            amount: withdrawAmount,
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalETokenBalance = await eToken().balanceOf(safeAddr);

          expect(finalTokenBalance).to.be.greaterThan(initialTokenBalance);
          expect(finalETokenBalance).to.be.lessThan(initialETokenBalance);
        });

        it('Should withdraw max', async () => {
          // First deposit to have something to withdraw
          const amount = ethers.parseUnits('2000', tokenConfig[underlying].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[underlying].address);
          await fundAccountWithToken(safeAddr, underlying, amount);

          await executeAction({
            type: 'EulerV2Supply',
            poolAddress,
            amount,
          });

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialETokenBalance = await eToken().balanceOf(safeAddr);

          await executeAction({
            type: 'EulerV2Withdraw',
            poolAddress,
            amount: ethers.MaxUint256,
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalETokenBalance = await eToken().balanceOf(safeAddr);

          expect(finalTokenBalance).to.be.greaterThan(initialTokenBalance);
          expect(finalETokenBalance).to.equal(0);
        });

        it('Should take fees on withdraw', async () => {
          const amount = ethers.parseUnits('2000', tokenConfig[underlying].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[underlying].address);
          await fundAccountWithToken(safeAddr, underlying, amount);

          const feeConfig = await adminVault.feeConfig();
          const feeRecipient = feeConfig.recipient;
          const feeRecipientTokenBalanceBefore = await tokenContract.balanceOf(feeRecipient);
          const feeRecipientETokenBalanceBefore = await eToken().balanceOf(feeRecipient);

          // Do an initial supply with fees
          const supplyTx = await executeAction({
            type: 'EulerV2Supply',
            poolAddress,
            amount,
            feeBasis: 10,
          });

          const eTokenBalanceAfterSupply = await eToken().balanceOf(safeAddr);

          // Time travel 1 year
          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
            safeAddr,
            poolAddress
          );
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          // Do a withdraw with fees
          const withdrawTx = await executeAction({
            type: 'EulerV2Withdraw',
            poolAddress,
            amount: '1',
            feeBasis: 10,
          });

          const supplyReceipt = await supplyTx.wait();
          if (!supplyReceipt) throw new Error('Supply transaction failed to get receipt');

          const withdrawReceipt = await withdrawTx.wait();
          if (!withdrawReceipt) throw new Error('Withdraw transaction failed to get receipt');

          // Calculate expected fee
          const expectedFee = await calculateExpectedFee(
            supplyReceipt,
            withdrawReceipt,
            10,
            eTokenBalanceAfterSupply
          );
          const expectedFeeRecipientBalance = feeRecipientETokenBalanceBefore + expectedFee;

          expect(await tokenContract.balanceOf(feeRecipient)).to.equal(feeRecipientTokenBalanceBefore);
          expect(await eToken().balanceOf(feeRecipient)).to.equal(expectedFeeRecipientBalance);
        });

        it('Should revert on withdraw with insufficient balance', async () => {
          const amount = ethers.parseUnits('1000', tokenConfig[underlying].decimals);
          await expect(
            executeAction({
              type: 'EulerV2Withdraw',
              poolAddress,
              amount,
            })
          ).to.be.revertedWith('GS013'); // Insufficient balance for withdrawal
        });
      });
    });

    describe('General tests', () => {
      it('Should emit the correct log on withdraw', async () => {
        const token = 'EULER_V2_PRIME_USDC';
        const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
        await fundAccountWithToken(safeAddr, token, amount);
        const strategyId = BigInt(42);
        const poolId: BytesLike = ethers.keccak256(tokenConfig.EULER_V2_PRIME_USDC.address).slice(0, 10);

        const tx = await executeAction({
          type: 'EulerV2Withdraw',
          poolAddress: tokenConfig.EULER_V2_PRIME_USDC.address,
          amount,
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
        expect(txLog).to.have.property('strategyId', strategyId);
        expect(txLog).to.have.property('poolId', poolId);
        expect(txLog).to.have.property('balanceBefore', amount);
        expect(txLog).to.have.property('balanceAfter');
        expect(txLog).to.have.property('feeInTokens');
        expect(txLog.balanceAfter).to.be.lt(txLog.balanceBefore);
        expect(txLog.feeInTokens).to.equal(BigInt(0));
      });

      it('Should have withdraw action type', async () => {
        const actionType = await eulerWithdrawContract.actionType();
        expect(actionType).to.equal(actionTypes.WITHDRAW_ACTION);
      });

      it('Should reject invalid token', async () => {
        await expect(
          executeAction({
            type: 'EulerV2Withdraw',
            poolAddress: '0x0000000000000000000000000000000000000000',
          })
        ).to.be.revertedWith('GS013'); // Invalid target contract address
      });
    });
  });
}); 