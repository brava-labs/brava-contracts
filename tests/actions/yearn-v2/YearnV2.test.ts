import { BytesLike } from 'ethers';
import { network } from 'hardhat';
import { ethers, expect, Signer } from '../..';
import { actionTypes } from '../../actions';
import { tokenConfig } from '../../constants';
import {
  AdminVault,
  IERC20,
  IYearnVault,
  Logger,
  YearnV2Supply,
  YearnV2Withdraw,
  ISafe,
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
import { fundAccountWithToken, getTokenContract } from '../../utils-stable';

describe('YearnV2 tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let safe: ISafe;
  let loggerAddress: string;
  let logger: Logger;
  let snapshotId: string;
  let USDC: IERC20;
  let USDT: IERC20;
  let DAI: IERC20;
  let yearnSupplyContract: YearnV2Supply;
  let yearnWithdrawContract: YearnV2Withdraw;
  let yearnSupplyAddress: string;
  let yearnWithdrawAddress: string;
  let yUSDC: IYearnVault;
  let yUSDT: IYearnVault;
  let yDAI: IYearnVault;
  let adminVault: AdminVault;
  const YEARN_USDC_ADDRESS = tokenConfig.YEARN_V2_USDC.address;
  const YEARN_USDT_ADDRESS = tokenConfig.YEARN_V2_USDT.address;
  const YEARN_DAI_ADDRESS = tokenConfig.YEARN_V2_DAI.address;

  // Run tests for each supported token
  const testCases: Array<{
    token: keyof typeof tokenConfig;
    poolAddress: string;
    yToken: () => IYearnVault;
  }> = [
    {
      token: 'USDC',
      poolAddress: YEARN_USDC_ADDRESS,
      yToken: () => yUSDC,
    },
    {
      token: 'USDT',
      poolAddress: YEARN_USDT_ADDRESS,
      yToken: () => yUSDT,
    },
    {
      token: 'DAI',
      poolAddress: YEARN_DAI_ADDRESS,
      yToken: () => yDAI,
    },
  ];

  before(async () => {
    [signer] = await ethers.getSigners();
    const baseSetup = await getBaseSetup(signer);
    if (!baseSetup) {
      throw new Error('Base setup not deployed');
    }
    safe = await baseSetup.safe;
    safeAddr = (await safe.getAddress()) as string;
    loggerAddress = (await baseSetup.logger.getAddress()) as string;
    logger = await ethers.getContractAt('Logger', loggerAddress);
    adminVault = await baseSetup.adminVault;

    // Fetch the tokens
    const tokens = await getTokenContract(['USDC', 'USDT', 'DAI']);
    USDC = tokens.USDC;
    USDT = tokens.USDT;
    DAI = tokens.DAI;

    // Initialize YearnV2Supply and YearnV2Withdraw actions
    yearnSupplyContract = await deploy(
      'YearnV2Supply',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    yearnWithdrawContract = await deploy(
      'YearnV2Withdraw',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    yearnSupplyAddress = await yearnSupplyContract.getAddress();
    yearnWithdrawAddress = await yearnWithdrawContract.getAddress();
    yUSDC = await ethers.getContractAt('IYearnVault', YEARN_USDC_ADDRESS);
    yUSDT = await ethers.getContractAt('IYearnVault', YEARN_USDT_ADDRESS);
    yDAI = await ethers.getContractAt('IYearnVault', YEARN_DAI_ADDRESS);

    // grant the yToken contracts the POOL_ROLE
    await adminVault.proposePool('YearnV2', YEARN_USDC_ADDRESS);
    await adminVault.proposePool('YearnV2', YEARN_USDT_ADDRESS);
    await adminVault.proposePool('YearnV2', YEARN_DAI_ADDRESS);
    await adminVault.addPool('YearnV2', YEARN_USDC_ADDRESS);
    await adminVault.addPool('YearnV2', YEARN_USDT_ADDRESS);
    await adminVault.addPool('YearnV2', YEARN_DAI_ADDRESS);

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

  describe('YearnV2 Supply', () => {
    testCases.forEach(({ token, poolAddress, yToken }) => {
      describe(`Testing ${token}`, () => {
        it('Should deposit', async () => {
          const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialYearnV2Balance = await yToken().balanceOf(safeAddr);

          await executeAction({
            type: 'YearnV2Supply',
            poolAddress,
            amount,
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalyTokenBalance = await yToken().balanceOf(safeAddr);

          expect(finalTokenBalance).to.equal(initialTokenBalance - amount);
          expect(finalyTokenBalance).to.be.greaterThan(initialYearnV2Balance);
        });

        it('Should deposit max', async () => {
          const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          expect(await tokenContract.balanceOf(safeAddr)).to.equal(amount);

          await executeAction({
            type: 'YearnV2Supply',
            poolAddress,
            amount: ethers.MaxUint256,
          });

          expect(await tokenContract.balanceOf(safeAddr)).to.equal(0);
          expect(await yToken().balanceOf(safeAddr)).to.be.greaterThan(0);
        });

        it('Should take fees on deposit', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          const feeConfig = await adminVault.feeConfig();
          const feeRecipient = feeConfig.recipient;
          const feeRecipientTokenBalanceBefore = await tokenContract.balanceOf(feeRecipient);
          const feeRecipientyTokenBalanceBefore = await yToken().balanceOf(feeRecipient);

          // Do an initial deposit
          const firstTx = await executeAction({
            type: 'YearnV2Supply',
            poolAddress,
            amount,
            feeBasis: 10,
          });

          const yTokenBalanceAfterFirstTx = await yToken().balanceOf(safeAddr);

          // Time travel 1 year
          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
            safeAddr,
            poolAddress
          );
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          // Do another deposit to trigger fees
          const secondTx = await executeAction({
            type: 'YearnV2Supply',
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
            yTokenBalanceAfterFirstTx
          );
          const expectedFeeRecipientBalance = feeRecipientyTokenBalanceBefore + expectedFee;

          // Check fees were taken in yTokens, not underlying
          expect(await tokenContract.balanceOf(feeRecipient)).to.equal(
            feeRecipientTokenBalanceBefore
          );
          expect(await yToken().balanceOf(feeRecipient)).to.equal(expectedFeeRecipientBalance);
        });
      });
    });

    describe('General tests', () => {
      it('Should emit the correct log on deposit', async () => {
        const token = 'USDC';
        const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
        await fundAccountWithToken(safeAddr, token, amount);
        const strategyId: number = 42;
        const poolId: BytesLike = ethers.keccak256(YEARN_USDC_ADDRESS).slice(0, 10);

        const tx = await executeAction({
          type: 'YearnV2Supply',
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
          YEARN_USDC_ADDRESS
        );
        expect(initialLastFeeTimestamp).to.equal(0n);

        await executeAction({
          type: 'YearnV2Supply',
          poolAddress: YEARN_USDC_ADDRESS,
          amount: '0',
        });

        const finalLastFeeTimestamp = await adminVault.lastFeeTimestamp(
          safeAddr,
          YEARN_USDC_ADDRESS
        );
        expect(finalLastFeeTimestamp).to.not.equal(0n);
      });

      it('Should have deposit action type', async () => {
        const actionType = await yearnSupplyContract.actionType();
        expect(actionType).to.equal(actionTypes.DEPOSIT_ACTION);
      });

      it('Should reject invalid token', async () => {
        await expect(
          executeAction({
            type: 'YearnV2Supply',
            poolAddress: '0x0000000000000000000000000000000000000000',
            amount: '1',
          })
        ).to.be.revertedWith('GS013');
      });
    });
  });

  describe('YearnV2 Withdraw', () => {
    beforeEach(async () => {
      // Initialize the fee timestamp for all pools
      for (const { poolAddress } of testCases) {
        await executeAction({
          type: 'YearnV2Supply',
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
            type: 'YearnV2Supply',
            poolAddress,
            amount,
          });

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialYearnV2Balance = await yToken().balanceOf(safeAddr);

          await executeAction({
            type: 'YearnV2Withdraw',
            poolAddress,
            sharesToBurn: amount.toString(),
            minUnderlyingReceived: '0',
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalYearnV2Balance = await yToken().balanceOf(safeAddr);

          expect(finalTokenBalance).to.be.gt(initialTokenBalance);
          expect(finalYearnV2Balance).to.be.lt(initialYearnV2Balance);
        });

        it('Should withdraw the maximum amount', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          // Supply first
          await executeAction({
            type: 'YearnV2Supply',
            poolAddress,
            amount,
          });

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialYearnV2Balance = await yToken().balanceOf(safeAddr);
          expect(initialYearnV2Balance).to.be.gt(0);

          await executeAction({
            type: 'YearnV2Withdraw',
            poolAddress,
            sharesToBurn: ethers.MaxUint256,
            minUnderlyingReceived: '0',
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalYearnV2Balance = await yToken().balanceOf(safeAddr);

          expect(finalTokenBalance).to.be.gt(initialTokenBalance);
          expect(finalYearnV2Balance).to.equal(0);
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
            type: 'YearnV2Supply',
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
            type: 'YearnV2Withdraw',
            poolAddress,
            sharesToBurn: '1',
            minUnderlyingReceived: '0',
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
        const token = 'USDC';
        const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
        await fundAccountWithToken(safeAddr, token, amount);
        const strategyId: number = 42;
        const poolId: BytesLike = ethers.keccak256(YEARN_USDC_ADDRESS).slice(0, 10);

        // First supply to have something to withdraw
        await executeAction({
          type: 'YearnV2Supply',
          poolAddress: YEARN_USDC_ADDRESS,
          amount,
        });

        const yTokenBalance = await yUSDC.balanceOf(safeAddr);
        const minUnderlyingReceived = BigInt(0);

        const tx = await executeAction({
          type: 'YearnV2Withdraw',
          poolAddress: YEARN_USDC_ADDRESS,
          sharesToBurn: yTokenBalance.toString(),
          minUnderlyingReceived: minUnderlyingReceived.toString(),
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
        expect(txLog).to.have.property('strategyId', BigInt(strategyId));
        expect(txLog).to.have.property('poolId', poolId);
        expect(txLog).to.have.property('balanceBefore');
        expect(txLog).to.have.property('balanceAfter');
        expect(txLog).to.have.property('feeInTokens');
        expect(txLog.balanceBefore).to.equal(yTokenBalance);
        expect(txLog.balanceAfter).to.equal(BigInt(0));
        expect(txLog.feeInTokens).to.equal(BigInt(0));
      });

      it('Should have withdraw action type', async () => {
        const actionType = await yearnWithdrawContract.actionType();
        expect(actionType).to.equal(actionTypes.WITHDRAW_ACTION);
      });

      it('Should reject invalid token', async () => {
        await expect(
          executeAction({
            type: 'YearnV2Withdraw',
            poolAddress: '0x0000000000000000000000000000000000000000',
          })
        ).to.be.revertedWith('GS013');
      });
      it('Should not confuse underlying and share tokens', async () => {
        expect(await yUSDC.balanceOf(safeAddr)).to.equal(0);
        expect(await USDC.balanceOf(safeAddr)).to.equal(0);

        // give ourselves 1000 USDC
        const amount = ethers.parseUnits('1000', tokenConfig.USDC.decimals);
        await fundAccountWithToken(safeAddr, 'USDC', amount);

        expect(await USDC.balanceOf(safeAddr)).to.equal(amount);

        // deposit 100 USDC
        const depositAmount = ethers.parseUnits('100', tokenConfig.USDC.decimals);
        await executeAction({
          type: 'YearnV2Supply',
          poolAddress: YEARN_USDC_ADDRESS,
          amount: depositAmount,
        });

        // check we still have 900 USDC
        expect(await USDC.balanceOf(safeAddr)).to.equal(amount - depositAmount);

        // check that we have yUSDC
        const yTokenBalance = await yUSDC.balanceOf(safeAddr);
        expect(yTokenBalance).to.be.greaterThan(0);

        // withdraw 10% of shares
        const sharesToWithdraw = yTokenBalance / BigInt(10);
        const minUnderlyingReceived = BigInt(0);

        await executeAction({
          type: 'YearnV2Withdraw',
          poolAddress: YEARN_USDC_ADDRESS,
          sharesToBurn: sharesToWithdraw.toString(),
          minUnderlyingReceived: minUnderlyingReceived.toString(),
        });

        // Verify balances
        const finalShares = await yUSDC.balanceOf(safeAddr);
        const finalUnderlying = await USDC.balanceOf(safeAddr);

        // We expect to have 1000 minus 100 plus 10% of 100
        const expectedUnderlying = BigInt(amount) - BigInt(depositAmount) + BigInt(depositAmount) / BigInt(10);

        expect(finalShares).to.equal(yTokenBalance - sharesToWithdraw);
        expect(finalUnderlying).to.be.closeTo(BigInt(expectedUnderlying), BigInt(1000));
      });
    });
  });
});

export {};
