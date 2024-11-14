import { BytesLike } from 'ethers';
import { network } from 'hardhat';
import { ethers, expect, Signer } from '../..';
import { actionTypes } from '../../../tests/actions';
import { tokenConfig } from '../../../tests/constants';
import {
  AdminVault,
  ClearpoolSupply,
  ClearpoolWithdraw,
  IERC20,
  IClearpoolPool,
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
import { fundAccountWithToken, getUSDC } from '../../utils-stable';

describe('Clearpool tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let loggerAddress: string;
  let logger: Logger;
  let snapshotId: string;
  let USDC: IERC20;
  let clearpoolSupplyContract: ClearpoolSupply;
  let clearpoolSupplyAddress: string;
  let clearpoolWithdrawContract: ClearpoolWithdraw;
  let clearpoolWithdrawAddress: string;
  let cpPool: IClearpoolPool;
  let adminVault: AdminVault;
  const CLEARPOOL_POOL_ADDRESS = tokenConfig.cpALP_USDC.address; // We'll need to add this to config

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

    // Fetch the USDC token
    USDC = await getUSDC();

    // Initialize ClearpoolSupply and ClearpoolWithdraw actions
    clearpoolSupplyContract = await deploy(
      'ClearpoolSupply',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    clearpoolWithdrawContract = await deploy(
      'ClearpoolWithdraw',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    clearpoolSupplyAddress = await clearpoolSupplyContract.getAddress();
    clearpoolWithdrawAddress = await clearpoolWithdrawContract.getAddress();
    cpPool = await ethers.getContractAt('IClearpoolPool', CLEARPOOL_POOL_ADDRESS);

    // grant the Clearpool pool contract the POOL_ROLE
    await adminVault.proposePool('Clearpool', CLEARPOOL_POOL_ADDRESS);
    await adminVault.addPool('Clearpool', CLEARPOOL_POOL_ADDRESS);
  });

  beforeEach(async () => {
    log('Taking local snapshot');
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    log('Reverting to local snapshot');
    await network.provider.send('evm_revert', [snapshotId]);
  });

  describe('Clearpool Supply', () => {
    it('Should deposit USDC', async () => {
      const supplyAmount = ethers.parseUnits('2000', tokenConfig.USDC.decimals);
      await fundAccountWithToken(safeAddr, 'USDC', supplyAmount);

      const initialUSDCBalance = await USDC.balanceOf(safeAddr);
      const initialCpBalance = await cpPool.balanceOf(safeAddr);

      const tx = await executeAction({
        type: 'ClearpoolSupply',
        amount: supplyAmount,
        minSharesReceived: '0',
      });

      const finalUSDCBalance = await USDC.balanceOf(safeAddr);
      const finalCpBalance = await cpPool.balanceOf(safeAddr);

      expect(finalUSDCBalance).to.equal(initialUSDCBalance - supplyAmount);
      expect(finalCpBalance).to.be.greaterThan(initialCpBalance);
    });

    it('Should deposit max', async () => {
      const amount = ethers.parseUnits('2000', tokenConfig.USDC.decimals);
      await fundAccountWithToken(safeAddr, 'USDC', amount);

      expect(await USDC.balanceOf(safeAddr)).to.equal(amount);

      await executeAction({
        type: 'ClearpoolSupply',
        amount: ethers.MaxUint256,
        minSharesReceived: '0',
      });

      expect(await USDC.balanceOf(safeAddr)).to.equal(0);
      expect(await cpPool.balanceOf(safeAddr)).to.be.greaterThan(0);
    });

    it('Should emit the correct log on deposit', async () => {
      const amount = ethers.parseUnits('2000', tokenConfig.USDC.decimals);
      await fundAccountWithToken(safeAddr, 'USDC', amount);
      const strategyId: number = 42;
      const poolId: BytesLike = ethers.keccak256(CLEARPOOL_POOL_ADDRESS).slice(0, 10);

      const tx = await executeAction({
        type: 'ClearpoolSupply',
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

    it('Should have deposit action type', async () => {
      const actionType = await clearpoolSupplyContract.actionType();
      expect(actionType).to.equal(actionTypes.DEPOSIT_ACTION);
    });

    it('Should initialize last fee timestamp', async () => {
      const initialLastFeeTimestamp = await adminVault.lastFeeTimestamp(
        safeAddr,
        CLEARPOOL_POOL_ADDRESS
      );
      expect(initialLastFeeTimestamp).to.equal(BigInt(0));

      await fundAccountWithToken(safeAddr, 'USDC', 1000);

      const tx = await executeAction({
        type: 'ClearpoolSupply',
        minSharesReceived: '0',
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
        CLEARPOOL_POOL_ADDRESS
      );
      expect(finalLastFeeTimestamp).to.equal(BigInt(block.timestamp));
    });

    it('Should reject invalid token', async () => {
      await expect(
        executeAction({
          type: 'ClearpoolSupply',
          poolAddress: '0x0000000000000000000000000000000000000000',
          minSharesReceived: '0',
        })
      ).to.be.revertedWith('GS013');
    });

    it('Should take fees on deposit', async () => {
      const amount = ethers.parseUnits('100', tokenConfig.USDC.decimals);

      // Get fee recipient
      const feeConfig = await adminVault.feeConfig();
      if (!feeConfig.recipient || feeConfig.recipient === ethers.ZeroAddress) {
        throw new Error('Invalid fee recipient address');
      }
      const feeRecipient = feeConfig.recipient;

      // Initial balances
      const feeRecipientCpBalanceBefore = await cpPool.balanceOf(feeRecipient);

      // First deposit
      await fundAccountWithToken(safeAddr, 'USDC', amount);
      const firstDepositTx = await executeAction({
        type: 'ClearpoolSupply',
        amount: amount,
        minSharesReceived: '0',
        feeBasis: 10,
      });

      const cpBalanceAfterFirstDeposit = await cpPool.balanceOf(safeAddr);

      // Time travel (1 week)
      const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
        safeAddr,
        CLEARPOOL_POOL_ADDRESS
      );
      const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 7);
      await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

      // Second deposit
      await fundAccountWithToken(safeAddr, 'USDC', amount);
      const secondDepositTx = await executeAction({
        type: 'ClearpoolSupply',
        amount: amount,
        minSharesReceived: '0',
        feeBasis: 10,
      });

      // Calculate expected fee
      const expectedFee = await calculateExpectedFee(
        (await firstDepositTx.wait()) ??
          (() => {
            throw new Error('First deposit transaction failed');
          })(),
        (await secondDepositTx.wait()) ??
          (() => {
            throw new Error('Second deposit transaction failed');
          })(),
        10,
        cpBalanceAfterFirstDeposit
      );

      const expectedFeeRecipientBalance = feeRecipientCpBalanceBefore + expectedFee;

      // Verify fee was taken in cpTokens
      expect(await cpPool.balanceOf(feeRecipient)).to.equal(expectedFeeRecipientBalance);
    });
  });

  describe('Clearpool Withdraw', () => {
    beforeEach(async () => {
      // Do an empty deposit to initialize the fee timestamp
      await executeAction({
        type: 'ClearpoolSupply',
        minSharesReceived: '0',
      });
    });

    it('Should withdraw USDC', async () => {
      const amount = ethers.parseUnits('100', tokenConfig.USDC.decimals);
      // Fund with cpToken (pool shares) instead of USDC
      await fundAccountWithToken(safeAddr, 'cpALP_USDC', amount);

      const initialUSDCBalance = await USDC.balanceOf(safeAddr);
      const initialCpBalance = await cpPool.balanceOf(safeAddr);

      const tx = await executeAction({
        type: 'ClearpoolWithdraw',
        amount,
        maxSharesBurned: ethers.MaxUint256,
      });

      const finalUSDCBalance = await USDC.balanceOf(safeAddr);
      const finalCpBalance = await cpPool.balanceOf(safeAddr);

      expect(finalUSDCBalance).to.be.equal(initialUSDCBalance + amount);
      expect(finalCpBalance).to.be.lessThan(initialCpBalance);
    });

    it('Should withdraw the maximum amount', async () => {
      const amount = ethers.parseUnits('100', tokenConfig.USDC.decimals);
      await fundAccountWithToken(safeAddr, 'cpALP_USDC', amount);

      expect(await cpPool.balanceOf(safeAddr)).to.equal(amount);
      expect(await USDC.balanceOf(safeAddr)).to.equal(0);

      await executeAction({
        type: 'ClearpoolWithdraw',
        amount: ethers.MaxUint256,
        maxSharesBurned: ethers.MaxUint256.toString(),
      });

      expect(await cpPool.balanceOf(safeAddr)).to.equal(0);
      expect(await USDC.balanceOf(safeAddr)).to.be.greaterThan(0);
    });

    it('Should emit the correct log on withdraw', async () => {
      const amount = ethers.parseUnits('100', tokenConfig.USDC.decimals);
      await fundAccountWithToken(safeAddr, 'cpALP_USDC', amount);
      const strategyId: number = 42;
      const poolId: BytesLike = ethers.keccak256(CLEARPOOL_POOL_ADDRESS).slice(0, 10);

      const tx = await executeAction({
        type: 'ClearpoolWithdraw',
        amount,
        maxSharesBurned: ethers.MaxUint256,
      });

      const logs = await decodeLoggerLog(tx);
      log('Logs:', logs);

      expect(logs).to.have.length(1);
      expect(logs[0]).to.have.property('eventId', BigInt(ACTION_LOG_IDS.BALANCE_UPDATE));

      const txLog = logs[0] as BalanceUpdateLog;
      expect(txLog).to.have.property('safeAddress', safeAddr);
      expect(txLog).to.have.property('strategyId', BigInt(strategyId));
      expect(txLog).to.have.property('poolId', poolId);
      expect(txLog).to.have.property('balanceBefore', amount);
      expect(txLog).to.have.property('balanceAfter');
      expect(txLog).to.have.property('feeInTokens');
      expect(txLog.balanceAfter).to.be.a('bigint');
      expect(txLog.balanceAfter).to.be.lessThan(amount);
    });

    it('Should use the exit function to withdraw', async () => {
      const clearpoolWithdrawContractAddress = await clearpoolWithdrawContract.getAddress();
      await fundAccountWithToken(clearpoolWithdrawContractAddress, 'cpALP_USDC', 100);

      const tx = await clearpoolWithdrawContract.exit(CLEARPOOL_POOL_ADDRESS);

      expect(await cpPool.balanceOf(clearpoolWithdrawContractAddress)).to.equal(BigInt(0));
    });

    it('Should take fees', async () => {
      const amount = ethers.parseUnits('100', tokenConfig.USDC.decimals);
      await fundAccountWithToken(safeAddr, 'USDC', amount);

      const feeConfig = await adminVault.feeConfig();
      if (!feeConfig.recipient || feeConfig.recipient === ethers.ZeroAddress) {
        throw new Error('Invalid fee recipient address');
      }
      const feeRecipient = feeConfig.recipient;

      const feeRecipientUSDCBalanceBefore = await USDC.balanceOf(feeRecipient);
      const feeRecipientCpBalanceBefore = await cpPool.balanceOf(feeRecipient);

      // First supply to get some shares
      const supplyTx = await executeAction({
        type: 'ClearpoolSupply',
        amount,
        minSharesReceived: '0',
        feeBasis: 10,
      });

      const cpBalanceAfterSupply = await cpPool.balanceOf(safeAddr);

      const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
        safeAddr,
        CLEARPOOL_POOL_ADDRESS
      );
      // Clearpool has a 2 week limit, so we'll add 1 week
      const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 7); // 1 week

      // Time travel
      await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

      const withdrawTx = await executeAction({
        type: 'ClearpoolWithdraw',
        feeBasis: 10,
        amount: '1',
        maxSharesBurned: ethers.MaxUint256.toString(),
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
        cpBalanceAfterSupply
      );
      const expectedFeeRecipientBalance = feeRecipientCpBalanceBefore + expectedFee;

      // Fees should be taken in cpTokens, not USDC
      expect(await USDC.balanceOf(feeRecipient)).to.equal(feeRecipientUSDCBalanceBefore);
      expect(await cpPool.balanceOf(feeRecipient)).to.equal(expectedFeeRecipientBalance);
    });

    it('Should have withdraw action type', async () => {
      const actionType = await clearpoolWithdrawContract.actionType();
      expect(actionType).to.equal(actionTypes.WITHDRAW_ACTION);
    });

    it('Should reject invalid token', async () => {
      await expect(
        executeAction({
          type: 'ClearpoolWithdraw',
          poolAddress: '0x0000000000000000000000000000000000000000',
          amount: '1',
          maxSharesBurned: ethers.MaxUint256,
        })
      ).to.be.revertedWith('GS013');
    });
  });
});
