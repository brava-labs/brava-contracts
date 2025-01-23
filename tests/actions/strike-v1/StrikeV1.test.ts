import { network } from 'hardhat';
import { ethers, expect, Signer } from '../..';
import {
  AdminVault,
  CTokenInterface,
  IERC20,
  Logger,
  StrikeV1Supply,
  StrikeV1Withdraw,
} from '../../../typechain-types';
import { actionTypes } from '../../actions';
import { tokenConfig } from '../../constants';
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
import { fundAccountWithToken, getUSDC, getUSDT } from '../../utils-stable';

describe('Strike tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let loggerAddress: string;
  let logger: Logger;
  let snapshotId: string;
  let USDC: IERC20;
  let USDT: IERC20;
  let strikeSupplyContract: StrikeV1Supply;
  let strikeWithdrawContract: StrikeV1Withdraw;
  let strikeSupplyAddress: string;
  let strikeWithdrawAddress: string;
  let sUSDC: CTokenInterface;
  let sUSDT: CTokenInterface;
  let adminVault: AdminVault;

  // Define test cases for each supported token
  const testCases: Array<{
    token: keyof typeof tokenConfig;
    poolAddress: string;
    sToken: () => CTokenInterface;
  }> = [
    {
      token: 'USDC',
      poolAddress: tokenConfig.STRIKE_V1_USDC.address,
      sToken: () => sUSDC,
    },
    {
      token: 'USDT',
      poolAddress: tokenConfig.STRIKE_V1_USDT.address,
      sToken: () => sUSDT,
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
    // Fetch the USDC and USDT tokens
    USDC = await getUSDC();
    USDT = await getUSDT();
    sUSDC = await ethers.getContractAt('CTokenInterface', tokenConfig.STRIKE_V1_USDC.address);
    sUSDT = await ethers.getContractAt('CTokenInterface', tokenConfig.STRIKE_V1_USDT.address);

    // Initialize StrikeV1Supply and StrikeV1Withdraw actions
    strikeSupplyContract = await deploy(
      'StrikeV1Supply',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    strikeWithdrawContract = await deploy(
      'StrikeV1Withdraw',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    strikeSupplyAddress = await strikeSupplyContract.getAddress();
    strikeWithdrawAddress = await strikeWithdrawContract.getAddress();

    // Grant the sUSDC and sUSDT contracts the POOL_ROLE
    await adminVault.proposeAction(getBytes4(strikeSupplyAddress), strikeSupplyAddress);
    await adminVault.proposeAction(getBytes4(strikeWithdrawAddress), strikeWithdrawAddress);
    await adminVault.addAction(getBytes4(strikeSupplyAddress), strikeSupplyAddress);
    await adminVault.addAction(getBytes4(strikeWithdrawAddress), strikeWithdrawAddress);
    await adminVault.proposePool('StrikeV1', tokenConfig.STRIKE_V1_USDC.address);
    await adminVault.proposePool('StrikeV1', tokenConfig.STRIKE_V1_USDT.address);
    await adminVault.addPool('StrikeV1', tokenConfig.STRIKE_V1_USDC.address);
    await adminVault.addPool('StrikeV1', tokenConfig.STRIKE_V1_USDT.address);
  });

  beforeEach(async () => {
    log('Taking local snapshot');
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    log('Reverting to local snapshot');
    await network.provider.send('evm_revert', [snapshotId]);
  });

  describe('Strike Supply', () => {
    testCases.forEach(({ token, poolAddress, sToken }) => {
      describe(`Testing ${token} Supply`, () => {
        it('Should deposit', async () => {
          const supplyAmount = ethers.parseUnits('2000', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, supplyAmount);

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialStrikeBalance = await sToken().balanceOf(safeAddr);

          log('Executing supply action');
          log(getBytes4(poolAddress));
          log(supplyAmount.toString());

          // Check adminVault has the pool
          const fetchedPoolAddress = await adminVault.getPoolAddress(
            'StrikeV1',
            getBytes4(poolAddress)
          );
          log('Pool address', fetchedPoolAddress);

          await executeAction({
            type: 'StrikeV1Supply',
            assetId: getBytes4(poolAddress),
            amount: supplyAmount.toString(),
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalStrikeBalance = await sToken().balanceOf(safeAddr);

          expect(finalTokenBalance).to.be.lt(initialTokenBalance);
          expect(finalStrikeBalance).to.be.gt(initialStrikeBalance);
        });

        it('Should deposit max', async () => {
          const supplyAmount = ethers.parseUnits('2000', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, supplyAmount);

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialStrikeBalance = await sToken().balanceOf(safeAddr);

          await executeAction({
            type: 'StrikeV1Supply',
            assetId: getBytes4(poolAddress),
            amount: ethers.MaxUint256.toString(),
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          expect(finalTokenBalance).to.be.equal(0n);

          const finalStrikeBalance = await sToken().balanceOf(safeAddr);
          expect(finalStrikeBalance).to.be.gt(0n);
        });

        it('Should take fees on deposit', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          const feeConfig = await adminVault.feeConfig();
          const feeRecipient = feeConfig.recipient;
          const feeRecipientStrikeBalanceBefore = await sToken().balanceOf(feeRecipient);

          // Do an initial deposit
          const firstTx = await executeAction({
            type: 'StrikeV1Supply',
            assetId: getBytes4(poolAddress),
            amount: amount.toString(),
            feeBasis: 10,
          });

          const strikeBalanceAfterFirstTx = await sToken().balanceOf(safeAddr);

          // Time travel 1 year
          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
            safeAddr,
            poolAddress
          );
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          // Do another deposit to trigger fees
          const secondTx = await executeAction({
            type: 'StrikeV1Supply',
            assetId: getBytes4(poolAddress),
            amount: '0',
            feeBasis: 10,
          });

          const expectedFee = await calculateExpectedFee(
            (await firstTx.wait())!,
            (await secondTx.wait())!,
            10,
            strikeBalanceAfterFirstTx
          );
          const expectedFeeRecipientBalance = feeRecipientStrikeBalanceBefore + expectedFee;

          // Check fees were taken in sTokens, not underlying
          expect(await sToken().balanceOf(feeRecipient)).to.equal(expectedFeeRecipientBalance);
        });
      });
    });
    describe('General Strike Supply Tests', () => {
      it('Should emit the correct log on deposit', async () => {
        const token = 'USDC';
        const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
        await fundAccountWithToken(safeAddr, token, amount);
        const strategyId: number = 42;

        const tx = await executeAction({
          type: 'StrikeV1Supply',
          assetId: getBytes4(tokenConfig.STRIKE_V1_USDC.address),
          amount: amount.toString(),
        });

        const logs = await decodeLoggerLog(tx);
        log('Logs:', logs);

        expect(logs).to.have.length(1);
        expect(logs[0]).to.have.property('eventId', BigInt(ACTION_LOG_IDS.BALANCE_UPDATE));

        const txLog = logs[0] as BalanceUpdateLog;
        expect(txLog).to.have.property('safeAddress', safeAddr);
        expect(txLog).to.have.property('strategyId', BigInt(strategyId));
        expect(txLog).to.have.property('poolId', getBytes4(tokenConfig.STRIKE_V1_USDC.address));
        expect(txLog).to.have.property('balanceBefore', 0n);
        expect(txLog).to.have.property('balanceAfter');
        expect(txLog).to.have.property('feeInTokens', 0n);
        expect(txLog.balanceAfter).to.be.a('bigint');
        expect(txLog.balanceAfter).to.not.equal(BigInt(0));
      });

      it('Should initialize the last fee timestamp', async () => {
        const token = 'STRIKE_V1_USDC';
        const initialLastFeeTimestamp = await adminVault.lastFeeTimestamp(
          safeAddr,
          tokenConfig[token].address
        );
        expect(initialLastFeeTimestamp).to.equal(0n);

        await executeAction({
          type: 'StrikeV1Supply',
          assetId: getBytes4(tokenConfig.STRIKE_V1_USDC.address),
          amount: '0',
        });

        const finalLastFeeTimestamp = await adminVault.lastFeeTimestamp(
          safeAddr,
          tokenConfig[token].address
        );
        expect(finalLastFeeTimestamp).to.not.equal(0n);
      });

      it('Should have the deposit action type', async () => {
        const actionType = await strikeSupplyContract.actionType();
        expect(actionType).to.equal(actionTypes.DEPOSIT_ACTION);
      });

      it('Should reject invalid token', async () => {
        await expect(
          executeAction({
            type: 'StrikeV1Supply',
            assetId: '0x00000000',
            amount: '1',
          })
        ).to.be.revertedWith('GS013');
      });
    });
  });

  describe('Strike Withdraw', () => {
    beforeEach(async () => {
      // Initialize the fee timestamp for all pools
      for (const { poolAddress } of testCases) {
        await executeAction({
          type: 'StrikeV1Supply',
          assetId: getBytes4(poolAddress),
          amount: '0',
        });
      }
    });

    testCases.forEach(({ token, poolAddress, sToken }) => {
      describe(`Testing ${token} Withdraw`, () => {
        it('Should withdraw', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, `STRIKE_V1_${token}`, amount);

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialStrikeBalance = await sToken().balanceOf(safeAddr);
          const initialUnderlyingBalance = await sToken().balanceOfUnderlying.staticCall(safeAddr);

          const tx = await executeAction({
            type: 'StrikeV1Withdraw',
            assetId: getBytes4(poolAddress),
            amount: ethers.MaxUint256.toString(),
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalStrikeBalance = await sToken().balanceOf(safeAddr);
          expect(finalTokenBalance).to.equal(initialTokenBalance + initialUnderlyingBalance);
          expect(finalStrikeBalance).to.be.lt(initialStrikeBalance);
        });

        it('Should withdraw max', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          await fundAccountWithToken(safeAddr, `STRIKE_V1_${token}`, amount);

          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          const initialStrikeBalance = await sToken().balanceOf(safeAddr);

          await executeAction({
            type: 'StrikeV1Withdraw',
            assetId: getBytes4(poolAddress),
            amount: ethers.MaxUint256.toString(),
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalStrikeBalance = await sToken().balanceOf(safeAddr);
          expect(finalTokenBalance).to.be.gt(0n);
          expect(finalStrikeBalance).to.be.lt(initialStrikeBalance);
        });

        it('Should take fees on withdraw', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          await fundAccountWithToken(safeAddr, token, amount);

          const feeConfig = await adminVault.feeConfig();
          const feeRecipient = feeConfig.recipient;
          const feeRecipientStrikeBalanceBefore = await sToken().balanceOf(feeRecipient);

          const supplyTx = await executeAction({
            type: 'StrikeV1Supply',
            assetId: getBytes4(poolAddress),
            amount: amount.toString(),
            feeBasis: 10,
          });

          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
            safeAddr,
            poolAddress
          );
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          const strikeBalanceAfterSupply = await sToken().balanceOf(safeAddr);

          // Withdraw to trigger fees
          const withdrawTx = await executeAction({
            type: 'StrikeV1Withdraw',
            assetId: getBytes4(poolAddress),
            feeBasis: 10,
            amount: '1',
          });

          const expectedFee = await calculateExpectedFee(
            (await supplyTx.wait())!,
            (await withdrawTx.wait())!,
            10,
            strikeBalanceAfterSupply
          );
          const expectedFeeRecipientBalance = feeRecipientStrikeBalanceBefore + expectedFee;

          expect(await sToken().balanceOf(feeRecipient)).to.equal(expectedFeeRecipientBalance);
        });
      });
    });

    describe('General Strike Withdraw Tests', () => {
      it('Should emit the correct log on withdraw', async () => {
        const token = 'USDC';
        const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
        await fundAccountWithToken(safeAddr, 'STRIKE_V1_USDC', amount);
        const strategyId: number = 42;
        const poolAddress = await sUSDC.getAddress();
        const poolId: string = getBytes4(poolAddress);

        const tx = await executeAction({
          type: 'StrikeV1Withdraw',
          assetId: poolId,
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
        expect(txLog).to.have.property('balanceBefore', amount);
        expect(txLog).to.have.property('balanceAfter').to.be.lt(amount);
        expect(txLog).to.have.property('feeInTokens', BigInt(0));
      });

      it('Should have withdraw action type', async () => {
        const actionType = await strikeWithdrawContract.actionType();
        expect(actionType).to.equal(actionTypes.WITHDRAW_ACTION);
      });

      it('Should reject invalid token', async () => {
        await expect(
          executeAction({
            type: 'StrikeV1Withdraw',
            assetId: '0x00000000',
            amount: '1',
          })
        ).to.be.revertedWith('GS013');
      });
    });
  });
});
