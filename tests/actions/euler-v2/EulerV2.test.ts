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

describe.only('EulerV2 tests', () => {
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

    // Grant the Euler contracts the POOL_ROLE
    await adminVault.proposePool('EulerV2', tokenConfig.EULER_V2_PRIME_USDC.address);
    await adminVault.proposePool('EulerV2', tokenConfig.EULER_V2_YIELD_USDC.address);
    await adminVault.proposePool('EulerV2', tokenConfig.EULER_V2_YIELD_USDT.address);
    await adminVault.proposePool('EulerV2', tokenConfig.EULER_V2_YIELD_USDE.address);
    await adminVault.addPool('EulerV2', tokenConfig.EULER_V2_PRIME_USDC.address);
    await adminVault.addPool('EulerV2', tokenConfig.EULER_V2_YIELD_USDC.address);
    await adminVault.addPool('EulerV2', tokenConfig.EULER_V2_YIELD_USDT.address);
    await adminVault.addPool('EulerV2', tokenConfig.EULER_V2_YIELD_USDE.address);
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
          const protocolId = BigInt(
            ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['string'], ['Euler']))
          );
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
          if (!firstTxReceipt) throw new Error('First deposit transaction failed');

          const secondTxReceipt = await secondTx.wait();
          if (!secondTxReceipt) throw new Error('Second deposit transaction failed');

          const feeRecipientTokenBalanceAfter = await tokenContract.balanceOf(feeRecipient);
          const feeRecipientETokenBalanceAfter = await eToken().balanceOf(feeRecipient);

          expect(feeRecipientETokenBalanceAfter).to.be.greaterThan(feeRecipientETokenBalanceBefore);
        });
      });
    });
  });

  describe('EulerV2 Withdraw', () => {
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
          // First deposit to have something to withdraw
          const amount = ethers.parseUnits('2000', tokenConfig[underlying].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[underlying].address);
          await fundAccountWithToken(safeAddr, underlying, amount);

          await executeAction({
            type: 'EulerV2Supply',
            poolAddress,
            amount,
          });

          const feeConfig = await adminVault.feeConfig();
          const feeRecipient = feeConfig.recipient;
          const feeRecipientTokenBalanceBefore = await tokenContract.balanceOf(feeRecipient);
          const feeRecipientETokenBalanceBefore = await eToken().balanceOf(feeRecipient);

          // Time travel 1 year to accrue fees
          const protocolId = BigInt(
            ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['string'], ['Euler']))
          );
          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
            safeAddr,
            poolAddress
          );
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          // Do a withdraw with fees
          const withdrawAmount = ethers.parseUnits('1000', tokenConfig[underlying].decimals);
          const tx = await executeAction({
            type: 'EulerV2Withdraw',
            poolAddress,
            amount: withdrawAmount,
            feeBasis: 10,
          });

          const receipt = await tx.wait();
          if (!receipt) throw new Error('Withdraw transaction failed');

          const feeRecipientTokenBalanceAfter = await tokenContract.balanceOf(feeRecipient);
          const feeRecipientETokenBalanceAfter = await eToken().balanceOf(feeRecipient);

          expect(feeRecipientETokenBalanceAfter).to.be.greaterThan(feeRecipientETokenBalanceBefore);
        });

        it('Should revert on withdraw with insufficient balance', async () => {
          const amount = ethers.parseUnits('1000', tokenConfig[underlying].decimals);
          await expect(
            executeAction({
              type: 'EulerV2Withdraw',
              poolAddress,
              amount,
            })
          ).to.be.reverted;
        });

        it('Should revert on withdraw with amount greater than balance', async () => {
          // First deposit a small amount
          const depositAmount = ethers.parseUnits('100', tokenConfig[underlying].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[underlying].address);
          await fundAccountWithToken(safeAddr, underlying, depositAmount);

          await executeAction({
            type: 'EulerV2Supply',
            poolAddress,
            amount: depositAmount,
          });

          // Try to withdraw more than deposited
          const withdrawAmount = ethers.parseUnits('200', tokenConfig[underlying].decimals);
          await expect(
            executeAction({
              type: 'EulerV2Withdraw',
              poolAddress,
              amount: withdrawAmount,
            })
          ).to.be.reverted;
        });
      });
    });
  });
}); 