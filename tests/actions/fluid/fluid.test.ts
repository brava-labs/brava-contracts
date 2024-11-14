import { BytesLike } from 'ethers';
import { network } from 'hardhat';
import { ethers, expect, Signer } from '../..';
import { actionTypes } from '../../../tests/actions';
import { tokenConfig } from '../../../tests/constants';
import {
  AdminVault,
  FluidSupply,
  FluidWithdraw,
  IERC20,
  IFluidLending,
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
import { fundAccountWithToken, getUSDC, getUSDT } from '../../utils-stable';

describe('Fluid tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let loggerAddress: string;
  let logger: Logger;
  let snapshotId: string;
  let USDC: IERC20;
  let USDT: IERC20;
  let fluidSupplyContract: FluidSupply;
  let fluidWithdrawContract: FluidWithdraw;
  let fluidSupplyAddress: string;
  let fluidWithdrawAddress: string;
  let fUSDC: IFluidLending;
  let fUSDT: IFluidLending;
  let adminVault: AdminVault;
  const FLUID_USDC_ADDRESS = tokenConfig.fUSDC.address;
  const FLUID_USDT_ADDRESS = tokenConfig.fUSDT.address;

  // Run tests for each supported token
  const testCases: Array<{
    token: keyof typeof tokenConfig;
    poolAddress: string;
    fToken: () => IFluidLending;
  }> = [
    {
      token: 'USDC',
      poolAddress: tokenConfig.fUSDC.address,
      fToken: () => fUSDC,
    },
    {
      token: 'USDT',
      poolAddress: tokenConfig.fUSDT.address,
      fToken: () => fUSDT,
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
    // Fetch the USDC token
    USDC = await getUSDC();
    USDT = await getUSDT();

    // Initialize FluidSupply and FluidWithdraw actions
    fluidSupplyContract = await deploy(
      'FluidSupply',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    fluidWithdrawContract = await deploy(
      'FluidWithdraw',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    fluidSupplyAddress = await fluidSupplyContract.getAddress();
    fluidWithdrawAddress = await fluidWithdrawContract.getAddress();
    fUSDC = await ethers.getContractAt('IFluidLending', FLUID_USDC_ADDRESS);
    fUSDT = await ethers.getContractAt('IFluidLending', FLUID_USDT_ADDRESS);

    // grant the fUSDC and fUSDT contracts the POOL_ROLE
    await adminVault.proposePool('Fluid', FLUID_USDC_ADDRESS);
    await adminVault.proposePool('Fluid', FLUID_USDT_ADDRESS);
    await adminVault.addPool('Fluid', FLUID_USDC_ADDRESS);
    await adminVault.addPool('Fluid', FLUID_USDT_ADDRESS);
  });

  beforeEach(async () => {
    // IMPORTANT: take a new snapshot, they can't be reused!
    log('Taking local snapshot');
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    log('Reverting to local snapshot');
    await network.provider.send('evm_revert', [snapshotId]);
  });

  describe('Fluid Supply', () => {
    testCases.forEach(({ token, poolAddress, fToken }) => {
      describe(`Testing ${token}`, () => {
        it('Should deposit', async () => {
          const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialFluidBalance = await fToken().balanceOf(safeAddr);

          await executeAction({
            type: 'FluidSupply',
            poolAddress,
            amount,
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalfTokenBalance = await fToken().balanceOf(safeAddr);

          expect(finalTokenBalance).to.equal(initialTokenBalance - amount);
          expect(finalfTokenBalance).to.be.greaterThan(initialFluidBalance);
        });

        it('Should deposit max', async () => {
          const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          expect(await tokenContract.balanceOf(safeAddr)).to.equal(amount);

          await executeAction({
            type: 'FluidSupply',
            poolAddress,
            amount: ethers.MaxUint256,
          });

          expect(await tokenContract.balanceOf(safeAddr)).to.equal(0);
          expect(await fToken().balanceOf(safeAddr)).to.be.greaterThan(0);
        });

        it('Should take fees on deposit', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          const feeConfig = await adminVault.feeConfig();
          const feeRecipient = feeConfig.recipient;
          const feeRecipientTokenBalanceBefore = await tokenContract.balanceOf(feeRecipient);
          const feeRecipientfTokenBalanceBefore = await fToken().balanceOf(feeRecipient);

          // Do an initial deposit
          const firstTx = await executeAction({
            type: 'FluidSupply',
            poolAddress,
            amount,
            feeBasis: 10,
          });

          const fTokenBalanceAfterFirstTx = await fToken().balanceOf(safeAddr);

          // Time travel 1 year
          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(safeAddr, poolAddress);
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          // Do another deposit to trigger fees
          const secondTx = await executeAction({
            type: 'FluidSupply',
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
            fTokenBalanceAfterFirstTx
          );
          const expectedFeeRecipientBalance = feeRecipientfTokenBalanceBefore + expectedFee;

          // Check fees were taken in fTokens, not underlying
          expect(await tokenContract.balanceOf(feeRecipient)).to.equal(
            feeRecipientTokenBalanceBefore
          );
          expect(await fToken().balanceOf(feeRecipient)).to.equal(expectedFeeRecipientBalance);
        });
      });
    });

    describe('General tests', () => {
      it('Should emit the correct log on deposit', async () => {
        const token = 'USDC';
        const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
        await fundAccountWithToken(safeAddr, token, amount);
        const strategyId: number = 42;
        const poolId: BytesLike = ethers.keccak256(FLUID_USDC_ADDRESS).slice(0, 10);

        const tx = await executeAction({
          type: 'FluidSupply',
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
          FLUID_USDC_ADDRESS
        );
        expect(initialLastFeeTimestamp).to.equal(BigInt(0));

        await fundAccountWithToken(safeAddr, 'USDC', 1000);

        const tx = await executeAction({
          type: 'FluidSupply',
        });

        //get the block timestamp of the tx
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
          FLUID_USDC_ADDRESS
        );
        expect(finalLastFeeTimestamp).to.equal(BigInt(block.timestamp));
      });
      it('Should have deposit action type', async () => {
        const actionType = await fluidSupplyContract.actionType();
        expect(actionType).to.equal(actionTypes.DEPOSIT_ACTION);
      });
      it('Should reject invalid token', async () => {
        await expect(
          executeAction({
            type: 'FluidSupply',
            poolAddress: '0x0000000000000000000000000000000000000000',
          })
        ).to.be.revertedWith('GS013');
      });
    });
  });

  describe('Fluid Withdraw', () => {
    beforeEach(async () => {
      // Do empty deposits to initialize the fee timestamps for both pools
      for (const { poolAddress } of testCases) {
        await executeAction({
          type: 'FluidSupply',
          poolAddress,
          amount: '0',
        });
      }
    });

    testCases.forEach(({ token, poolAddress, fToken }) => {
      describe(`Testing ${token}`, () => {
        it('Should withdraw', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, `f${token}`, amount);

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialfTokenBalance = await fToken().balanceOf(safeAddr);

          await executeAction({
            type: 'FluidWithdraw',
            poolAddress,
            amount,
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalfTokenBalance = await fToken().balanceOf(safeAddr);
          expect(finalTokenBalance).to.equal(initialTokenBalance + amount);
          expect(finalfTokenBalance).to.be.lessThan(initialfTokenBalance);
        });

        it('Should withdraw the maximum amount', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, `f${token}`, amount);

          expect(await fToken().balanceOf(safeAddr)).to.equal(amount);
          expect(await tokenContract.balanceOf(safeAddr)).to.equal(0);

          await executeAction({
            type: 'FluidWithdraw',
            poolAddress,
            amount: ethers.MaxUint256,
          });

          expect(await fToken().balanceOf(safeAddr)).to.equal(0);
          expect(await tokenContract.balanceOf(safeAddr)).to.be.greaterThan(0);
        });

        it('Should take fees on withdraw', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          const feeConfig = await adminVault.feeConfig();
          const feeRecipient = feeConfig.recipient;
          const feeRecipientTokenBalanceBefore = await tokenContract.balanceOf(feeRecipient);
          const feeRecipientfTokenBalanceBefore = await fToken().balanceOf(feeRecipient);

          const supplyTx = await executeAction({
            type: 'FluidSupply',
            poolAddress,
            amount,
            feeBasis: 10,
          });

          const fTokenBalanceAfterSupply = await fToken().balanceOf(safeAddr);

          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(safeAddr, poolAddress);
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          const withdrawTx = await executeAction({
            type: 'FluidWithdraw',
            poolAddress,
            feeBasis: 10,
            amount: '1',
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
            fTokenBalanceAfterSupply
          );
          const expectedFeeRecipientBalance = feeRecipientfTokenBalanceBefore + expectedFee;

          expect(await tokenContract.balanceOf(feeRecipient)).to.equal(
            feeRecipientTokenBalanceBefore
          );
          expect(await fToken().balanceOf(feeRecipient)).to.equal(expectedFeeRecipientBalance);
        });
      });
    });

    describe('General tests', () => {
      it('Should have withdraw action type', async () => {
        const actionType = await fluidWithdrawContract.actionType();
        expect(actionType).to.equal(actionTypes.WITHDRAW_ACTION);
      });

      it('Should reject invalid token', async () => {
        const supplyAmount = ethers.parseUnits('2000', tokenConfig.USDC.decimals);
        await fundAccountWithToken(safeAddr, 'USDC', supplyAmount);
        await expect(
          executeAction({
            type: 'FluidSupply',
            poolAddress: '0x0000000000000000000000000000000000000000',
          })
        ).to.be.revertedWith('GS013');
      });
    });
  });
});

export {};
