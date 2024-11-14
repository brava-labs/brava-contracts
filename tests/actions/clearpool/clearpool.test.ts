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
  let clearpoolWithdrawContract: ClearpoolWithdraw;
  let clearpoolSupplyAddress: string;
  let clearpoolWithdrawAddress: string;
  let adminVault: AdminVault;

  // Run tests for each supported pool
  const testCases: Array<{
    poolName: string;
    poolAddress: string;
    underlying: keyof typeof tokenConfig;
  }> = [
    {
      poolName: 'ALP',
      poolAddress: tokenConfig.cpALP_USDC.address,
      underlying: 'USDC',
    },
    {
      poolName: 'AUR',
      poolAddress: tokenConfig.cpAUR_USDC.address,
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

    // grant the Clearpool pool contracts the POOL_ROLE
    for (const { poolName, poolAddress } of testCases) {
      await adminVault.proposePool('Clearpool', poolAddress);
      await adminVault.addPool('Clearpool', poolAddress);
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
  describe('Clearpool Supply', () => {
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
            type: 'ClearpoolSupply',
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
            type: 'ClearpoolSupply',
            poolAddress,
            amount: ethers.MaxUint256.toString(),
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          expect(finalTokenBalance).to.equal(0n);
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
            type: 'ClearpoolSupply',
            poolAddress,
            amount,
            feeBasis: 10,
          });

          const poolBalanceAfterFirstTx = await poolContract.balanceOf(safeAddr);

          // Time travel 2 weeks (maximum allowed for Clearpool)
          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(safeAddr, poolAddress);
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 14); // 2 weeks
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          // Do another deposit to trigger fees
          const secondTx = await executeAction({
            type: 'ClearpoolSupply',
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
          const expectedFeeRecipientBalance = feeRecipientPoolBalanceBefore + expectedFee;

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
        const poolId: BytesLike = ethers.keccak256(tokenConfig.cpALP_USDC.address).slice(0, 10);

        const tx = await executeAction({
          type: 'ClearpoolSupply',
          poolAddress: tokenConfig.cpALP_USDC.address,
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
          tokenConfig.cpALP_USDC.address
        );
        expect(lastFeeTimestamp).to.equal(0n);

        await executeAction({
          type: 'ClearpoolSupply',
          poolAddress: tokenConfig.cpALP_USDC.address,
          amount: '0',
        });

        const lastFeeTimestampAfter = await adminVault.lastFeeTimestamp(
          safeAddr,
          tokenConfig.cpALP_USDC.address
        );
        expect(lastFeeTimestampAfter).to.not.equal(0n);
      });

      it('Should have deposit action type', async () => {
        const actionType = await clearpoolSupplyContract.actionType();
        expect(actionType).to.equal(actionTypes.DEPOSIT_ACTION);
      });

      it('Should reject invalid token', async () => {
        await expect(
          executeAction({
            type: 'ClearpoolSupply',
            poolAddress: '0x0000000000000000000000000000000000000000',
            amount: '1',
          })
        ).to.be.revertedWith('GS013');
      });
    });
  });
  describe('Clearpool Withdraw', () => {
    beforeEach(async () => {
      // Do empty deposits to initialize the fee timestamps for all pools
      for (const { poolAddress } of testCases) {
        await executeAction({
          type: 'ClearpoolSupply',
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
            type: 'ClearpoolSupply',
            poolAddress,
            amount,
          });

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialPoolBalance = await poolContract.balanceOf(safeAddr);

          await executeAction({
            type: 'ClearpoolWithdraw',
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
            type: 'ClearpoolSupply',
            poolAddress,
            amount,
          });

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialPoolBalance = await poolContract.balanceOf(safeAddr);
          expect(initialPoolBalance).to.be.gt(0);

          await executeAction({
            type: 'ClearpoolWithdraw',
            poolAddress,
            amount: ethers.MaxUint256,
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalPoolBalance = await poolContract.balanceOf(safeAddr);

          expect(finalTokenBalance).to.be.gt(initialTokenBalance);
          expect(finalPoolBalance).to.equal(0);
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
            type: 'ClearpoolSupply',
            poolAddress,
            amount,
            feeBasis: 10,
          });

          const poolBalanceAfterSupply = await poolContract.balanceOf(safeAddr);

          // Time travel 2 weeks (maximum allowed for Clearpool)
          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(safeAddr, poolAddress);
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 14); // 2 weeks
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          const withdrawTx = await executeAction({
            type: 'ClearpoolWithdraw',
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
          const expectedFeeRecipientBalance = feeRecipientPoolBalanceBefore + expectedFee;

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
          })
        ).to.be.revertedWith('GS013');
      });
    });
  });
});

export {};
