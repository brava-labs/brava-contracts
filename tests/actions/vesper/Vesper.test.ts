import { network } from 'hardhat';
import { ethers, expect, Signer } from '../..';
import { tokenConfig } from '../../../tests/constants';
import { AdminVault, IERC20, Logger, VesperSupply, VesperWithdraw } from '../../../typechain-types';
import { actionTypes } from '../../actions';
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
import { fundAccountWithToken, getUSDC } from '../../utils-stable';

describe('Vesper tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let loggerAddress: string;
  let logger: Logger;
  let snapshotId: string;
  let USDC: IERC20;
  let vesperSupplyContract: VesperSupply;
  let vesperWithdrawContract: VesperWithdraw;
  let vesperSupplyAddress: string;
  let vesperWithdrawAddress: string;
  let adminVault: AdminVault;

  // Run tests for each supported token
  const testCases: Array<{
    token: keyof typeof tokenConfig;
    poolAddress: string;
  }> = [
    {
      token: 'USDC',
      poolAddress: tokenConfig.VESPER_V1_USDC.address,
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

    // Initialize VesperSupply and VesperWithdraw actions
    vesperSupplyContract = await deploy(
      'VesperSupply',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    vesperWithdrawContract = await deploy(
      'VesperWithdraw',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    vesperSupplyAddress = await vesperSupplyContract.getAddress();
    vesperWithdrawAddress = await vesperWithdrawContract.getAddress();

    // Grant pool roles
    for (const { poolAddress } of testCases) {
      await adminVault.proposePool('Vesper', poolAddress);
      await adminVault.addPool('Vesper', poolAddress);
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

  describe('Vesper Supply', () => {
    testCases.forEach(({ token, poolAddress }) => {
      describe(`Testing ${token}`, () => {
        it('Should deposit', async () => {
          const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          const poolContract = await ethers.getContractAt('IVesperPool', poolAddress);
          await fundAccountWithToken(safeAddr, token, amount);

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialVesperBalance = await poolContract.balanceOf(safeAddr);

          await executeAction({
            type: 'VesperSupply',
            poolAddress,
            amount,
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalVesperBalance = await poolContract.balanceOf(safeAddr);

          expect(finalTokenBalance).to.equal(initialTokenBalance - amount);
          expect(finalVesperBalance).to.be.greaterThan(initialVesperBalance);
        });

        it('Should deposit max', async () => {
          const amount = ethers.parseUnits('2000', tokenConfig.USDC.decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig.USDC.address);
          const poolContract = await ethers.getContractAt('IVesperPool', testCases[0].poolAddress);
          await fundAccountWithToken(safeAddr, 'USDC', amount);

          await executeAction({
            type: 'VesperSupply',
            poolAddress: testCases[0].poolAddress,
            amount: ethers.MaxUint256.toString(),
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalVesperBalance = await poolContract.balanceOf(safeAddr);
          expect(finalTokenBalance).to.equal(0n);
          expect(finalVesperBalance).to.be.gt(0n);
        });

        it('Should take fees on deposit', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          const poolContract = await ethers.getContractAt('IVesperPool', poolAddress);
          await fundAccountWithToken(safeAddr, token, amount);

          const feeConfig = await adminVault.feeConfig();
          const feeRecipient = feeConfig.recipient;
          const feeRecipientTokenBalanceBefore = await tokenContract.balanceOf(feeRecipient);
          const feeRecipientVTokenBalanceBefore = await poolContract.balanceOf(feeRecipient);

          // Do initial deposit
          const firstTx = await executeAction({
            type: 'VesperSupply',
            poolAddress,
            amount,
            feeBasis: 10,
          });

          const vTokenBalanceAfterFirstTx = await poolContract.balanceOf(safeAddr);

          // Time travel 1 year
          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
            safeAddr,
            poolAddress
          );
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          // Do another deposit to trigger fees
          const secondTx = await executeAction({
            type: 'VesperSupply',
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

          // Calculate and verify fees
          const expectedFee = await calculateExpectedFee(
            firstTxReceipt,
            secondTxReceipt,
            10,
            vTokenBalanceAfterFirstTx
          );

          const expectedFeeRecipientBalance = feeRecipientVTokenBalanceBefore + expectedFee;

          expect(await tokenContract.balanceOf(feeRecipient)).to.equal(
            feeRecipientTokenBalanceBefore
          );
          expect(await poolContract.balanceOf(feeRecipient)).to.equal(expectedFeeRecipientBalance);
        });
      });
    });
    describe('General tests', () => {
      it('Should emit the correct log on deposit', async () => {
        const token = 'USDC';
        const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
        await fundAccountWithToken(safeAddr, token, amount);
        const strategyId: number = 42;

        const tx = await executeAction({
          type: 'VesperSupply',
          poolAddress: testCases[0].poolAddress,
          amount: amount.toString(),
        });

        const logs = await decodeLoggerLog(tx);
        log('Logs:', logs);

        expect(logs).to.have.length(1);
        expect(logs[0]).to.have.property('eventId', BigInt(ACTION_LOG_IDS.BALANCE_UPDATE));

        const txLog = logs[0] as BalanceUpdateLog;
        expect(txLog).to.have.property('safeAddress', safeAddr);
        expect(txLog).to.have.property('strategyId', BigInt(strategyId));
        expect(txLog).to.have.property('poolId', getBytes4(testCases[0].poolAddress));
        expect(txLog).to.have.property('balanceBefore', 0n);
        expect(txLog).to.have.property('balanceAfter');
        expect(txLog).to.have.property('feeInTokens', 0n);
        expect(txLog.balanceAfter).to.be.a('bigint');
        expect(txLog.balanceAfter).to.not.equal(BigInt(0));
      });

      it('Should have deposit action type', async () => {
        const actionType = await vesperSupplyContract.actionType();
        expect(actionType).to.equal(actionTypes.DEPOSIT_ACTION);
      });

      it('Should reject invalid token', async () => {
        await expect(
          executeAction({
            type: 'VesperSupply',
            poolAddress: '0x00000000',
            amount: '1',
          })
        ).to.be.revertedWith('GS013');
      });
    });
  });

  describe('Vesper Withdraw', () => {
    beforeEach(async () => {
      // Do empty deposits to initialize the fee timestamps for all pools
      for (const { poolAddress } of testCases) {
        await executeAction({
          type: 'VesperSupply',
          poolAddress,
          amount: '0',
        });
      }
    });

    testCases.forEach(({ token, poolAddress }) => {
      describe(`Testing ${token}`, () => {
        it('Should withdraw', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          const poolContract = await ethers.getContractAt('IVesperPool', poolAddress);

          // First supply to have something to withdraw
          await fundAccountWithToken(safeAddr, token, amount);
          await executeAction({
            type: 'VesperSupply',
            poolAddress,
            amount,
          });

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialVesperBalance = await poolContract.balanceOf(safeAddr);

          // Withdraw half of our shares
          const sharesToBurn = initialVesperBalance / BigInt(2);
          // Calculate expected underlying based on price per share
          const pricePerShare = await poolContract.pricePerShare();
          const expectedUnderlying = (sharesToBurn * pricePerShare) / BigInt(1e18);

          await executeAction({
            type: 'VesperWithdraw',
            poolAddress,
            sharesToBurn: sharesToBurn.toString(),
            minUnderlyingReceived: expectedUnderlying.toString(),
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalVesperBalance = await poolContract.balanceOf(safeAddr);

          expect(finalTokenBalance).to.be.greaterThan(initialTokenBalance);
          expect(finalVesperBalance).to.equal(initialVesperBalance - sharesToBurn);
        });

        it('Should withdraw the maximum amount', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          const poolContract = await ethers.getContractAt('IVesperPool', poolAddress);

          // First supply to have something to withdraw
          await fundAccountWithToken(safeAddr, token, amount);
          await executeAction({
            type: 'VesperSupply',
            poolAddress,
            amount,
          });

          const initialVesperBalance = await poolContract.balanceOf(safeAddr);
          expect(initialVesperBalance).to.be.gt(0);

          // Calculate expected underlying based on price per share
          const pricePerShare = await poolContract.pricePerShare();
          const expectedUnderlying = (initialVesperBalance * pricePerShare) / BigInt(1e18);

          await executeAction({
            type: 'VesperWithdraw',
            poolAddress,
            sharesToBurn: ethers.MaxUint256.toString(),
            minUnderlyingReceived: expectedUnderlying.toString(),
          });

          expect(await poolContract.balanceOf(safeAddr)).to.equal(0);
          expect(await tokenContract.balanceOf(safeAddr)).to.be.greaterThan(0);
        });

        it('Should take fees on withdraw', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          const poolContract = await ethers.getContractAt('IVesperPool', poolAddress);
          await fundAccountWithToken(safeAddr, token, amount);

          const feeConfig = await adminVault.feeConfig();
          const feeRecipient = feeConfig.recipient;
          const feeRecipientTokenBalanceBefore = await tokenContract.balanceOf(feeRecipient);
          const feeRecipientVTokenBalanceBefore = await poolContract.balanceOf(feeRecipient);

          const supplyTx = await executeAction({
            type: 'VesperSupply',
            poolAddress,
            amount,
            feeBasis: 10,
          });

          const vTokenBalanceAfterSupply = await poolContract.balanceOf(safeAddr);

          // Time travel 1 year
          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
            safeAddr,
            poolAddress
          );
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          // Withdraw a small amount of shares
          const sharesToBurn = vTokenBalanceAfterSupply / BigInt(10); // 10% of shares
          const pricePerShare = await poolContract.pricePerShare();
          const expectedUnderlying = (sharesToBurn * pricePerShare) / BigInt(1e18);

          const withdrawTx = await executeAction({
            type: 'VesperWithdraw',
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
            vTokenBalanceAfterSupply
          );
          const expectedFeeRecipientBalance = feeRecipientVTokenBalanceBefore + expectedFee;

          expect(await tokenContract.balanceOf(feeRecipient)).to.equal(
            feeRecipientTokenBalanceBefore
          );
          expect(await poolContract.balanceOf(feeRecipient)).to.equal(expectedFeeRecipientBalance);
        });

        it('Should not confuse underlying and share tokens', async () => {
          const poolContract = await ethers.getContractAt('IVesperPool', poolAddress);

          expect(await poolContract.balanceOf(safeAddr)).to.equal(0);
          expect(await USDC.balanceOf(safeAddr)).to.equal(0);

          // give ourselves 1000 USDC
          const amount = ethers.parseUnits('1000', tokenConfig.USDC.decimals);
          await fundAccountWithToken(safeAddr, 'USDC', amount);

          expect(await USDC.balanceOf(safeAddr)).to.equal(amount);

          // deposit 100 USDC
          const depositAmount = ethers.parseUnits('100', tokenConfig.USDC.decimals);
          await executeAction({
            type: 'VesperSupply',
            poolAddress,
            amount: depositAmount,
          });

          // check we still have 900 USDC
          expect(await USDC.balanceOf(safeAddr)).to.equal(amount - depositAmount);

          // check that we have vUSDC
          const vTokenBalance = await poolContract.balanceOf(safeAddr);
          expect(vTokenBalance).to.be.greaterThan(0);

          // withdraw 10% of shares
          const sharesToBurn = vTokenBalance / BigInt(10);
          const pricePerShare = await poolContract.pricePerShare();
          const expectedUnderlying = (sharesToBurn * pricePerShare) / BigInt(1e18);

          await executeAction({
            type: 'VesperWithdraw',
            poolAddress,
            sharesToBurn: sharesToBurn.toString(),
            minUnderlyingReceived: expectedUnderlying.toString(),
          });

          // Verify balances
          const finalShares = await poolContract.balanceOf(safeAddr);
          const finalUnderlying = await USDC.balanceOf(safeAddr);

          // Should have 90% of shares left
          expect(finalShares).to.equal(vTokenBalance - sharesToBurn);

          // Should have ~910 USDC (900 + ~10 withdrawn)
          expect(finalUnderlying).to.be.closeTo(
            amount - depositAmount + expectedUnderlying,
            ethers.parseUnits('0.1', tokenConfig.USDC.decimals)
          );
        });
      });
    });

    describe('General tests', () => {
      it('Should emit the correct log on withdraw', async () => {
        const amount = ethers.parseUnits('100', tokenConfig.USDC.decimals);
        const poolContract = await ethers.getContractAt('IVesperPool', testCases[0].poolAddress);
        await fundAccountWithToken(safeAddr, 'USDC', amount);
        const strategyId: number = 42;

        // First supply to have something to withdraw
        await executeAction({
          type: 'VesperSupply',
          poolAddress: testCases[0].poolAddress,
          amount,
        });

        const initialBalance = await poolContract.balanceOf(safeAddr);
        const pricePerShare = await poolContract.pricePerShare();
        const expectedUnderlying = (initialBalance * pricePerShare) / BigInt(1e18);

        const tx = await executeAction({
          type: 'VesperWithdraw',
          poolAddress: testCases[0].poolAddress,
          sharesToBurn: initialBalance.toString(),
          minUnderlyingReceived: expectedUnderlying.toString(),
        });

        const logs = await decodeLoggerLog(tx);
        log('Logs:', logs);

        expect(logs).to.have.length(1);
        expect(logs[0]).to.have.property('eventId', BigInt(ACTION_LOG_IDS.BALANCE_UPDATE));

        const txLog = logs[0] as BalanceUpdateLog;
        expect(txLog).to.have.property('safeAddress', safeAddr);
        expect(txLog).to.have.property('strategyId', BigInt(strategyId));
        expect(txLog).to.have.property('poolId', getBytes4(testCases[0].poolAddress));
        expect(txLog).to.have.property('balanceBefore', initialBalance);
        expect(txLog).to.have.property('balanceAfter', 0n);
        expect(txLog).to.have.property('feeInTokens', 0n);
      });

      it('Should have withdraw action type', async () => {
        const actionType = await vesperWithdrawContract.actionType();
        expect(actionType).to.equal(actionTypes.WITHDRAW_ACTION);
      });

      it('Should reject invalid token', async () => {
        await expect(
          executeAction({
            type: 'VesperWithdraw',
            poolAddress: '0x00000000',
            sharesToBurn: '1',
            minUnderlyingReceived: '0',
          })
        ).to.be.revertedWith('GS013');
      });
    });
  });
});
