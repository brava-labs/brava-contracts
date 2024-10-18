import { expect, ethers, Signer } from '../..';
import { network } from 'hardhat';
import {
  IERC20,
  FluidSupply,
  FluidWithdraw,
  IFluidLending,
  Logger,
  AdminVault,
} from '../../../typechain-types';
import {
  deploy,
  getBaseSetup,
  log,
  decodeLoggerLog,
  calculateExpectedFee,
  executeAction,
  getBytes4,
} from '../../utils';
import { ACTION_LOG_IDS, BalanceUpdateLog } from '../../logs';
import { fundAccountWithToken, getUSDC, getUSDT } from '../../utils-stable';
import { tokenConfig } from '../../../tests/constants';
import { actionTypes } from '../../../tests/actions';
import { BytesLike } from 'ethers';

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
    await adminVault.proposeAction(getBytes4(fluidSupplyAddress), fluidSupplyAddress);
    await adminVault.proposeAction(getBytes4(fluidWithdrawAddress), fluidWithdrawAddress);
    await adminVault.addAction(getBytes4(fluidSupplyAddress), fluidSupplyAddress);
    await adminVault.addAction(getBytes4(fluidWithdrawAddress), fluidWithdrawAddress);
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
    it('Should deposit USDC', async () => {
      const supplyAmount = ethers.parseUnits('2000', tokenConfig.USDC.decimals);
      await fundAccountWithToken(safeAddr, 'USDC', supplyAmount);

      const initialUSDCBalance = await USDC.balanceOf(safeAddr);
      const initialFluidBalance = await fUSDC.balanceOf(safeAddr);

      await executeAction({
        type: 'FluidSupply',
        amount: supplyAmount,
      });

      const finalUSDCBalance = await USDC.balanceOf(safeAddr);
      const finalfTokenBalance = await fUSDC.balanceOf(safeAddr);

      expect(finalUSDCBalance).to.equal(initialUSDCBalance - supplyAmount);
      expect(finalfTokenBalance).to.be.greaterThan(initialFluidBalance);
    });
    it('Should deposit USDT', async () => {
      const token = 'USDT';
      const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
      await fundAccountWithToken(safeAddr, token, amount);

      const initialUSDTBalance = await USDT.balanceOf(safeAddr);
      const initialFluidBalance = await fUSDT.balanceOf(safeAddr);

      await executeAction({
        type: 'FluidSupply',
        poolAddress: tokenConfig[token].pools.fluid,
        amount,
      });

      const finalUSDTBalance = await USDT.balanceOf(safeAddr);
      const finalfTokenBalance = await fUSDT.balanceOf(safeAddr);

      expect(finalUSDTBalance).to.equal(initialUSDTBalance - amount);
      expect(finalfTokenBalance).to.be.greaterThan(initialFluidBalance);
    });
    it('Should deposit max', async () => {
      const token = 'USDT';
      const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
      await fundAccountWithToken(safeAddr, token, amount);

      expect(await USDT.balanceOf(safeAddr)).to.equal(amount);

      await executeAction({
        type: 'FluidSupply',
        poolAddress: tokenConfig[token].pools.fluid,
        amount: ethers.MaxUint256,
      });

      expect(await USDT.balanceOf(safeAddr)).to.equal(0);
      expect(await fUSDT.balanceOf(safeAddr)).to.be.greaterThan(0);
    });
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

    it('Should have deposit action type', async () => {
      const actionType = await fluidSupplyContract.actionType();
      expect(actionType).to.equal(actionTypes.DEPOSIT_ACTION);
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
      const finalLastFeeTimestamp = await adminVault.lastFeeTimestamp(safeAddr, FLUID_USDC_ADDRESS);
      expect(finalLastFeeTimestamp).to.equal(BigInt(block.timestamp));
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

  describe('Fluid Withdraw', () => {
    beforeEach(async () => {
      // Do an empty deposit to initialize the fee timestamp
      await executeAction({
        type: 'FluidSupply',
      });
    });
    it('Should withdraw USDC', async () => {
      const amount = ethers.parseUnits('100', tokenConfig.fUSDC.decimals);
      await fundAccountWithToken(safeAddr, 'fUSDC', amount);

      const initialUSDCBalance = await USDC.balanceOf(safeAddr);
      const initialfUSDCBalance = await fUSDC.balanceOf(safeAddr);

      const tx = await executeAction({
        type: 'FluidWithdraw',
        amount,
      });

      const finalUSDCBalance = await USDC.balanceOf(safeAddr);
      const finalfUSDCBalance = await fUSDC.balanceOf(safeAddr);
      expect(finalUSDCBalance).to.equal(initialUSDCBalance + amount);
      expect(finalfUSDCBalance).to.be.lessThan(initialfUSDCBalance);
    });

    it('Should withdraw USDT', async () => {
      // Initialize the fee timestamp for fUSDT
      await executeAction({
        type: 'FluidSupply',
        poolAddress: tokenConfig.USDT.pools.fluid,
        amount: '0',
      });

      await fundAccountWithToken(safeAddr, 'fUSDT', 100);
      const withdrawAmount = ethers.parseUnits('100', tokenConfig.fUSDT.decimals);

      const initialUSDTBalance = await USDT.balanceOf(safeAddr);
      const initialfUSDTBalance = await fUSDT.balanceOf(safeAddr);

      await executeAction({
        type: 'FluidWithdraw',
        poolAddress: tokenConfig.USDT.pools.fluid,
        amount: withdrawAmount,
      });

      const finalUSDTBalance = await USDT.balanceOf(safeAddr);
      const finalfUSDTBalance = await fUSDT.balanceOf(safeAddr);
      expect(finalUSDTBalance).to.equal(initialUSDTBalance + withdrawAmount);
      expect(finalfUSDTBalance).to.be.lessThan(initialfUSDTBalance);
    });
    it('Should emit the correct log on withdraw', async () => {
      const token = 'USDC';
      const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
      await fundAccountWithToken(safeAddr, 'fUSDC', amount);
      const strategyId: number = 42;
      const poolId: BytesLike = ethers.keccak256(FLUID_USDC_ADDRESS).slice(0, 10);

      const tx = await executeAction({
        type: 'FluidWithdraw',
        poolAddress: tokenConfig[token].pools.fluid,
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
      expect(txLog).to.have.property('balanceBefore', amount);
      expect(txLog).to.have.property('balanceAfter');
      expect(txLog).to.have.property('feeInTokens');
      expect(txLog.balanceAfter).to.be.a('bigint');
      expect(txLog.balanceAfter).to.not.equal(BigInt(0));
    });

    it('Should use the exit function to withdraw', async () => {
      const fluidWithdrawContractAddress = await fluidWithdrawContract.getAddress();
      await fundAccountWithToken(fluidWithdrawContractAddress, 'fUSDC', 100);
      await fundAccountWithToken(fluidWithdrawContractAddress, 'fUSDT', 100);
      const withdrawAmount = ethers.parseUnits('100', tokenConfig.fUSDC.decimals);

      const tx = await fluidWithdrawContract.exit(FLUID_USDC_ADDRESS);

      expect(await fUSDC.balanceOf(fluidWithdrawContractAddress)).to.be.equal(BigInt(0));

      await fluidWithdrawContract.exit(FLUID_USDT_ADDRESS);
      expect(await fUSDT.balanceOf(fluidWithdrawContractAddress)).to.be.equal(BigInt(0));
    });
    it('Should withdraw the maximum amount of fUSDC', async () => {
      const token = 'USDC';
      const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
      await fundAccountWithToken(safeAddr, 'fUSDC', amount);

      expect(await fUSDC.balanceOf(safeAddr)).to.equal(amount);
      expect(await USDC.balanceOf(safeAddr)).to.equal(0);

      await executeAction({
        type: 'FluidWithdraw',
        poolAddress: tokenConfig[token].pools.fluid,
        amount: ethers.MaxUint256,
      });

      expect(await fUSDC.balanceOf(safeAddr)).to.equal(0);
      expect(await USDC.balanceOf(safeAddr)).to.be.greaterThan(0);
    });

    it('Should take fees', async () => {
      const token = 'USDC';
      const amount = ethers.parseUnits('100', tokenConfig[token].decimals);

      await fundAccountWithToken(safeAddr, token, amount);

      const feeRecipient = await adminVault.feeRecipient();
      const feeRecipientUSDCBalanceBefore = await USDC.balanceOf(feeRecipient);
      const feeRecipientfUSDCBalanceBefore = await fUSDC.balanceOf(feeRecipient);

      const supplyTx = await executeAction({
        type: 'FluidSupply',
        amount,
        feeBasis: 10,
      });

      const fUSDCBalanceAfterSupply = await fUSDC.balanceOf(safeAddr);

      const initialFeeTimestamp = await adminVault.lastFeeTimestamp(safeAddr, FLUID_USDC_ADDRESS);
      const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365); // add 1 year to the initial timestamp

      // now time travel like you're Dr Emmett Brown
      await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

      const withdrawTx = await executeAction({
        type: 'FluidWithdraw',
        poolAddress: tokenConfig[token].pools.fluid,
        feeBasis: 10,
        amount: '0',
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
        fUSDCBalanceAfterSupply
      );
      const expectedFeeRecipientBalance = feeRecipientfUSDCBalanceBefore + expectedFee;

      // don't take fees in the underlying asset
      expect(await USDC.balanceOf(feeRecipient)).to.equal(feeRecipientUSDCBalanceBefore);
      // take fees in the fToken
      expect(await fUSDC.balanceOf(feeRecipient)).to.equal(expectedFeeRecipientBalance);
    });
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

export {};
