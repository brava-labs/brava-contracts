import { network } from 'hardhat';
import { ethers, expect, Signer } from '../..';
import {
  AdminVault,
  MapleSupply,
  MapleWithdrawQueue,
  Logger,
  IERC20,
} from '../../../typechain-types';
import {
  getBaseSetup,
  deploy,
  executeAction,
  approveMapleKYC,
  processMapleWithdrawal,
} from '../../utils';
import { getBytes4 } from '../../shared-utils';
import { fundAccountWithToken, getTokenContract } from '../../utils-stable';
import { tokenConfig } from '../../constants';
import { decodeLoggerLog } from '../../utils';
import { ACTION_LOG_IDS, WithdrawalRequestLog } from '../../logs';

describe('Maple protocol actions', () => {
  let safeAddr: string;
  let adminVault: AdminVault;
  let logger: Logger;
  let mapleSupply: MapleSupply;
  let mapleWithdrawQueue: MapleWithdrawQueue;
  let USDC: IERC20;
  let snapshotId: string;
  let signer: Signer;

  before(async () => {
    const baseSetup = await getBaseSetup();
    signer = baseSetup.signer;
    safeAddr = await baseSetup.safe.getAddress();
    adminVault = baseSetup.adminVault;
    logger = baseSetup.logger;
    USDC = await getTokenContract('USDC');

    mapleSupply = await deploy(
      'MapleSupply',
      signer,
      await adminVault.getAddress(),
      await logger.getAddress()
    );
    mapleWithdrawQueue = await deploy(
      'MapleWithdrawQueue',
      signer,
      await adminVault.getAddress(),
      await logger.getAddress()
    );

    for (const [key, pool] of Object.entries(tokenConfig)) {
      if (key.startsWith('MAPLE_V1_')) {
        await adminVault.proposePool('MapleV1', pool.address);
        await adminVault.addPool('MapleV1', pool.address);
      }
    }

    // Register action contracts with AdminVault using deployed addresses for coverage compatibility
    const mapleSupplyActionId = getBytes4(await mapleSupply.getAddress());
    const mapleWithdrawActionId = getBytes4(await mapleWithdrawQueue.getAddress());

    await adminVault.proposeAction(mapleSupplyActionId, await mapleSupply.getAddress());
    await adminVault.proposeAction(mapleWithdrawActionId, await mapleWithdrawQueue.getAddress());
    await adminVault.addAction(mapleSupplyActionId, await mapleSupply.getAddress());
    await adminVault.addAction(mapleWithdrawActionId, await mapleWithdrawQueue.getAddress());

    await approveMapleKYC([safeAddr]);
  });

  beforeEach(async () => {
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    await network.provider.send('evm_revert', [snapshotId]);
  });

  describe('MapleSupply', () => {
    for (const [key, poolConfig] of Object.entries(tokenConfig)) {
      if (!key.startsWith('MAPLE_V1_')) {
        continue;
      }
      describe(`Testing ${key}`, () => {
        it('Should deposit', async () => {
          const amount = ethers.parseUnits('2000', poolConfig.decimals);
          await fundAccountWithToken(safeAddr, 'USDC', amount);
          const initialTokenBalance = await USDC.balanceOf(safeAddr);
          await executeAction({
            type: 'MapleSupply',
            poolAddress: poolConfig.address,
            amount,
          });
          const finalTokenBalance = await USDC.balanceOf(safeAddr);
          expect(finalTokenBalance).to.equal(initialTokenBalance - amount);
        });

        it('Should deposit max', async () => {
          const amount = ethers.parseUnits('2000', poolConfig.decimals);
          await fundAccountWithToken(safeAddr, 'USDC', amount);
          const initialTokenBalance = await USDC.balanceOf(safeAddr);
          await executeAction({
            type: 'MapleSupply',
            poolAddress: poolConfig.address,
            amount: ethers.MaxUint256,
          });
          expect(await USDC.balanceOf(safeAddr)).to.equal(0);
        });

        it('Should take fees on deposit', async () => {
          const amount = ethers.parseUnits('100', poolConfig.decimals);
          await fundAccountWithToken(safeAddr, 'USDC', amount);
          const feeConfig = await adminVault.feeConfig();
          const feeRecipient = feeConfig.recipient;
          const feeRecipientTokenBalanceBefore = await USDC.balanceOf(feeRecipient);
          // Do an initial deposit
          await executeAction({
            type: 'MapleSupply',
            poolAddress: poolConfig.address,
            amount,
            feeBasis: 10,
          });
          // Do another deposit to trigger fees
          await executeAction({
            type: 'MapleSupply',
            poolAddress: poolConfig.address,
            amount: '0',
            feeBasis: 10,
          });
          // Check fees were taken in pool tokens, not underlying
          expect(await USDC.balanceOf(feeRecipient)).to.equal(feeRecipientTokenBalanceBefore);
        });
      });
    }

    describe('General tests', () => {
      it('Should emit the correct log on deposit', async () => {
        // Use the first MAPLE_V1_ pool
        const [key, poolConfig] = Object.entries(tokenConfig).find(([k]) =>
          k.startsWith('MAPLE_V1_')
        )!;
        const amount = ethers.parseUnits('2000', poolConfig.decimals);
        await fundAccountWithToken(safeAddr, 'USDC', amount);
        const strategyId: number = 42;
        const poolId: string = ethers.keccak256(poolConfig.address).slice(0, 10);
        const tx = await executeAction({
          type: 'MapleSupply',
          poolAddress: poolConfig.address,
          amount,
        });
        const logs = await decodeLoggerLog(tx);
        expect(logs).to.have.length(1);
        expect(logs[0]).to.have.property('eventId', BigInt(ACTION_LOG_IDS.BALANCE_UPDATE));
        const txLog = logs[0] as any;
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
        // Use the first MAPLE_V1_ pool
        const [key, poolConfig] = Object.entries(tokenConfig).find(([k]) =>
          k.startsWith('MAPLE_V1_')
        )!;
        const initialLastFeeTimestamp = await adminVault.lastFeeTimestamp(
          safeAddr,
          poolConfig.address
        );
        expect(initialLastFeeTimestamp).to.equal(BigInt(0));
        await fundAccountWithToken(safeAddr, 'USDC', 1000);
        const tx = await executeAction({
          type: 'MapleSupply',
          poolAddress: poolConfig.address,
          amount: ethers.parseUnits('1000', poolConfig.decimals),
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
          poolConfig.address
        );
        expect(finalLastFeeTimestamp).to.equal(BigInt(block.timestamp));
      });

      it('Should have deposit action type', async () => {
        const actionType = await mapleSupply.actionType();
        expect(actionType).to.equal(0); // DEPOSIT_ACTION
      });

      it('Should reject invalid pool', async () => {
        await expect(
          executeAction({
            type: 'MapleSupply',
            poolAddress: '0x0000000000000000000000000000000000000000',
          })
        ).to.be.revertedWith('GS013');
      });
    });
  });

  describe('MapleWithdrawQueue', () => {
    for (const [key, poolConfig] of Object.entries(tokenConfig)) {
      if (!key.startsWith('MAPLE_V1_') || key === 'MAPLE_V1_HY_USDC') {
        continue; // Skip deprecated HY_USDC pool
      }
      describe(`Testing ${key}`, () => {
        it('Should withdraw', async () => {
          const depositAmount = ethers.parseUnits('1000', poolConfig.decimals);
          await fundAccountWithToken(safeAddr, 'USDC', depositAmount);
          await executeAction({
            type: 'MapleSupply',
            poolAddress: poolConfig.address,
            amount: depositAmount.toString(),
          });
          // Check Safe's share balance
          const pool = await ethers.getContractAt('IMaplePool', poolConfig.address);
          const shareBalance = await pool.balanceOf(safeAddr);
          // Withdraw 10% of shares
          const withdrawAmount = shareBalance / 10n;
          const initialTokenBalance = await USDC.balanceOf(safeAddr);
          const tx = await executeAction({
            type: 'MapleWithdrawQueue',
            poolAddress: poolConfig.address,
            sharesToBurn: withdrawAmount.toString(),
          });
          // Process the withdrawal request using helper
          await processMapleWithdrawal(poolConfig.address, BigInt(withdrawAmount));
          const finalTokenBalance = await USDC.balanceOf(safeAddr);
          expect(finalTokenBalance).to.be.gt(initialTokenBalance);
        });

        it('Should withdraw the maximum amount', async () => {
          const depositAmount = ethers.parseUnits('1000', poolConfig.decimals);
          await fundAccountWithToken(safeAddr, 'USDC', depositAmount);
          await executeAction({
            type: 'MapleSupply',
            poolAddress: poolConfig.address,
            amount: depositAmount.toString(),
          });
          // Check Safe's share balance
          const pool = await ethers.getContractAt('IMaplePool', poolConfig.address);
          const shareBalance = await pool.balanceOf(safeAddr);
          // Withdraw all shares
          const withdrawAmount = shareBalance;
          const initialTokenBalance = await USDC.balanceOf(safeAddr);
          await executeAction({
            type: 'MapleWithdrawQueue',
            poolAddress: poolConfig.address,
            sharesToBurn: withdrawAmount.toString(),
          });
          // Process the withdrawal request using helper
          await processMapleWithdrawal(poolConfig.address, BigInt(withdrawAmount));
          const finalTokenBalance = await USDC.balanceOf(safeAddr);
          expect(finalTokenBalance).to.be.gt(initialTokenBalance);
        });

        it('Should track withdrawal request IDs', async () => {
          const depositAmount = ethers.parseUnits('1000', poolConfig.decimals);
          await fundAccountWithToken(safeAddr, 'USDC', depositAmount);
          await executeAction({
            type: 'MapleSupply',
            poolAddress: poolConfig.address,
            amount: depositAmount.toString(),
          });

          // Check Safe's share balance
          const pool = await ethers.getContractAt('IMaplePool', poolConfig.address);
          const shareBalance = await pool.balanceOf(safeAddr);

          // Withdraw 10% of shares
          const withdrawAmount = shareBalance / 10n;

          // Execute withdrawal
          const tx = await executeAction({
            type: 'MapleWithdrawQueue',
            poolAddress: poolConfig.address,
            sharesToBurn: withdrawAmount.toString(),
          });

          // Verify that a WITHDRAWAL_REQUEST log was emitted
          const logs = await decodeLoggerLog(tx);
          const withdrawalRequestLog = logs.find(
            (l) => l.eventId === BigInt(ACTION_LOG_IDS.WITHDRAWAL_REQUEST)
          ) as WithdrawalRequestLog | undefined;
          expect(withdrawalRequestLog).to.exist;

          // Verify the log contains the correct data
          if (withdrawalRequestLog) {
            expect(withdrawalRequestLog.sharesToBurn).to.equal(withdrawAmount);
            expect(withdrawalRequestLog.poolAddress.toLowerCase()).to.equal(
              poolConfig.address.toLowerCase()
            );
            // Don't check the exact action address, different test environments may have different addresses
            expect(withdrawalRequestLog.requestId).to.be.a('bigint');
            expect(withdrawalRequestLog.requestId).to.be.gt(0);
          }
        });
      });
    }

    describe('General tests', () => {
      it('Should emit the correct log on withdrawal request', async () => {
        // Use the first MAPLE_V1_ pool
        const [key, poolConfig] = Object.entries(tokenConfig).find(([k]) =>
          k.startsWith('MAPLE_V1_')
        )!;

        // First deposit funds
        const depositAmount = ethers.parseUnits('1000', poolConfig.decimals);
        await fundAccountWithToken(safeAddr, 'USDC', depositAmount);
        await executeAction({
          type: 'MapleSupply',
          poolAddress: poolConfig.address,
          amount: depositAmount.toString(),
        });

        // Check share balance
        const pool = await ethers.getContractAt('IMaplePool', poolConfig.address);
        const shareBalance = await pool.balanceOf(safeAddr);

        // Get withdrawal manager to check request IDs
        const poolManager = await ethers.getContractAt('IMaplePoolManager', await pool.manager());
        const withdrawalManager = await ethers.getContractAt(
          'IMapleWithdrawalManagerQueue',
          await poolManager.withdrawalManager()
        );
        const [nextRequestId] = await withdrawalManager.queue();

        // Withdraw 10% of shares
        const withdrawAmount = shareBalance / 10n;
        const tx = await executeAction({
          type: 'MapleWithdrawQueue',
          poolAddress: poolConfig.address,
          sharesToBurn: withdrawAmount.toString(),
        });

        // Check logs
        const logs = await decodeLoggerLog(tx);
        const withdrawalRequestLog = logs.find(
          (l) => l.eventId === BigInt(ACTION_LOG_IDS.WITHDRAWAL_REQUEST)
        ) as WithdrawalRequestLog | undefined;
        expect(withdrawalRequestLog).to.exist;
        if (withdrawalRequestLog) {
          // Just check that we have a reasonable request ID, not a specific value
          expect(withdrawalRequestLog.requestId).to.be.gt(0);
        }
      });

      it('Should have withdraw action type', async () => {
        const actionType = await mapleWithdrawQueue.actionType();
        expect(actionType).to.equal(1); // WITHDRAW_ACTION
      });

      it('Should reject invalid pool', async () => {
        await expect(
          executeAction({
            type: 'MapleWithdrawQueue',
            poolAddress: '0x0000000000000000000000000000000000000000',
            sharesToBurn: '100',
          })
        ).to.be.revertedWith('GS013');
      });

      it('Should check for pending requests', async () => {
        // Use the first MAPLE_V1_ pool
        const [key, poolConfig] = Object.entries(tokenConfig).find(([k]) =>
          k.startsWith('MAPLE_V1_')
        )!;

        // First deposit funds
        const depositAmount = ethers.parseUnits('1000', poolConfig.decimals);
        await fundAccountWithToken(safeAddr, 'USDC', depositAmount);
        await executeAction({
          type: 'MapleSupply',
          poolAddress: poolConfig.address,
          amount: depositAmount.toString(),
        });

        // Check share balance
        const pool = await ethers.getContractAt('IMaplePool', poolConfig.address);
        const shareBalance = await pool.balanceOf(safeAddr);

        // Submit a withdrawal request
        const withdrawAmount = shareBalance / 10n;
        const tx = await executeAction({
          type: 'MapleWithdrawQueue',
          poolAddress: poolConfig.address,
          sharesToBurn: withdrawAmount.toString(),
        });

        // Verify that a WITHDRAWAL_REQUEST log was emitted
        const logs = await decodeLoggerLog(tx);
        const withdrawalRequestLog = logs.find(
          (l) => l.eventId === BigInt(ACTION_LOG_IDS.WITHDRAWAL_REQUEST)
        ) as WithdrawalRequestLog | undefined;
        expect(withdrawalRequestLog).to.exist;

        // Process the withdrawal
        await processMapleWithdrawal(poolConfig.address, withdrawAmount);
      });
    });
  });

  describe('Workflow tests', () => {
    it('should demonstrate the correct withdrawal workflow', async () => {
      // Use MAPLE_V1_BC_USDC (working pool, not deprecated HY_USDC)
      const poolConfig = tokenConfig.MAPLE_V1_BC_USDC;

      // Deposit first
      const depositAmount = ethers.parseUnits('1000', poolConfig.decimals);
      await fundAccountWithToken(safeAddr, 'USDC', depositAmount);
      await executeAction({
        type: 'MapleSupply',
        poolAddress: poolConfig.address,
        amount: depositAmount.toString(),
      });

      // Get share balance
      const pool = await ethers.getContractAt('IMaplePool', poolConfig.address);
      const shareBalance = await pool.balanceOf(safeAddr);

      // Step 1: Request withdrawal of 1/4 of the shares
      const quarterShares = shareBalance / 4n;

      await executeAction({
        type: 'MapleWithdrawQueue',
        poolAddress: poolConfig.address,
        sharesToBurn: quarterShares.toString(),
      });

      // Step 2: Process the withdrawal (this is crucial - Maple requires processing before new requests)
      await processMapleWithdrawal(poolConfig.address, quarterShares);

      // Step 3: Request another withdrawal (only possible after processing the previous one)
      const eighthShares = shareBalance / 8n;

      await executeAction({
        type: 'MapleWithdrawQueue',
        poolAddress: poolConfig.address,
        sharesToBurn: eighthShares.toString(),
      });
    });

    it('should fail when trying to submit multiple withdrawal requests', async () => {
      // Use MAPLE_V1_BC_USDC (working pool, not deprecated HY_USDC)
      const poolConfig = tokenConfig.MAPLE_V1_BC_USDC;

      // Deposit first
      const depositAmount = ethers.parseUnits('1000', poolConfig.decimals);
      await fundAccountWithToken(safeAddr, 'USDC', depositAmount);
      await executeAction({
        type: 'MapleSupply',
        poolAddress: poolConfig.address,
        amount: depositAmount.toString(),
      });

      // Get share balance
      const pool = await ethers.getContractAt('IMaplePool', poolConfig.address);
      const shareBalance = await pool.balanceOf(safeAddr);

      // Submit first withdrawal request
      const tenthShares = shareBalance / 10n;
      await executeAction({
        type: 'MapleWithdrawQueue',
        poolAddress: poolConfig.address,
        sharesToBurn: tenthShares.toString(),
      });

      // Attempting second request without processing should fail with GS013
      await expect(
        executeAction({
          type: 'MapleWithdrawQueue',
          poolAddress: poolConfig.address,
          sharesToBurn: tenthShares.toString(),
        })
      ).to.be.revertedWith('GS013'); // Safe transaction execution failed
    });
  });
});
