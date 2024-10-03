import { expect, ethers, Signer } from '../..';
import { network } from 'hardhat';
import {
  IERC20,
  YearnSupply,
  YearnWithdraw,
  IYearnVault,
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
} from '../../utils';
import { BalanceUpdateLog } from '../../logs';
import { fundAccountWithToken, getUSDC } from '../../utils-stable';
import { tokenConfig } from '../../constants';
import { actionTypes } from '../../actions';
import { BytesLike } from 'ethers';

describe('Yearn tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let loggerAddress: string;
  let logger: Logger;
  let snapshotId: string;
  let USDC: IERC20;
  let yearnSupplyContract: YearnSupply;
  let yearnWithdrawContract: YearnWithdraw;
  let yUSDC: IYearnVault;
  let adminVault: AdminVault;
  const YEARN_USDC_ADDRESS = tokenConfig.yUSDC.address;

  before(async () => {
    [signer] = await ethers.getSigners();
    const baseSetup = await getBaseSetup();
    if (!baseSetup) {
      throw new Error('Base setup not deployed');
    }
    safeAddr = (await baseSetup.safe.getAddress()) as string;
    loggerAddress = (await baseSetup.logger.getAddress()) as string;
    logger = await ethers.getContractAt('Logger', loggerAddress);
    adminVault = await baseSetup.adminVault;
    // Fetch the USDC token
    USDC = await getUSDC();

    // Initialize YearnSupply and YearnWithdraw actions
    yearnSupplyContract = await deploy(
      'YearnSupply',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    yearnWithdrawContract = await deploy(
      'YearnWithdraw',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    yUSDC = await ethers.getContractAt('IYearnVault', YEARN_USDC_ADDRESS);

    await adminVault.proposeRole(await adminVault.POOL_ROLE(), YEARN_USDC_ADDRESS);
    await adminVault.grantRole(await adminVault.POOL_ROLE(), YEARN_USDC_ADDRESS);
    await adminVault.addPool(
      'Yearn',
      ethers.keccak256(YEARN_USDC_ADDRESS).slice(0, 10),
      YEARN_USDC_ADDRESS
    );
  });

  beforeEach(async () => {
    log('Taking local snapshot');
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    log('Reverting to local snapshot');
    await network.provider.send('evm_revert', [snapshotId]);
  });

  describe('Yearn Supply', () => {
    it('Should deposit USDC', async () => {
      const supplyAmount = ethers.parseUnits('2000', tokenConfig.USDC.decimals);
      await fundAccountWithToken(safeAddr, 'USDC', supplyAmount);

      const initialUSDCBalance = await USDC.balanceOf(safeAddr);
      const initialYearnBalance = await yUSDC.balanceOf(safeAddr);

      await executeAction({
        type: 'YearnSupply',
        amount: supplyAmount,
      });

      const finalUSDCBalance = await USDC.balanceOf(safeAddr);
      const finalyTokenBalance = await yUSDC.balanceOf(safeAddr);

      expect(finalUSDCBalance).to.equal(initialUSDCBalance - supplyAmount);
      expect(finalyTokenBalance).to.be.greaterThan(initialYearnBalance);
    });

    it('Should deposit max', async () => {
      const amount = ethers.parseUnits('2000', tokenConfig.USDC.decimals);
      await fundAccountWithToken(safeAddr, 'USDC', amount);

      expect(await USDC.balanceOf(safeAddr)).to.equal(amount);

      await executeAction({
        type: 'YearnSupply',
        amount: ethers.MaxUint256,
      });

      expect(await USDC.balanceOf(safeAddr)).to.equal(0);
      expect(await yUSDC.balanceOf(safeAddr)).to.be.greaterThan(0);
    });

    it('Should emit the correct log on deposit', async () => {
      const amount = ethers.parseUnits('2000', tokenConfig.USDC.decimals);
      await fundAccountWithToken(safeAddr, 'USDC', amount);
      const strategyId: number = 42;
      const poolId: BytesLike = ethers.keccak256(YEARN_USDC_ADDRESS).slice(0, 10);

      const tx = await executeAction({
        type: 'YearnSupply',
        amount,
      });

      const logs = await decodeLoggerLog(tx, loggerAddress);
      log('Logs:', logs);

      expect(logs).to.have.length(1);
      expect(logs[0]).to.have.property('eventName', 'BalanceUpdate');

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
      const actionType = await yearnSupplyContract.actionType();
      expect(actionType).to.equal(actionTypes.DEPOSIT_ACTION);
    });

    it('Should initialize last fee timestamp', async () => {
      const initialLastFeeTimestamp = await adminVault.lastFeeTimestamp(
        safeAddr,
        YEARN_USDC_ADDRESS
      );
      expect(initialLastFeeTimestamp).to.equal(BigInt(0));

      await fundAccountWithToken(safeAddr, 'USDC', 1000);

      const tx = await executeAction({
        type: 'YearnSupply',
      });

      const txReceipt = await tx.wait();
      const block = await ethers.provider.getBlock(txReceipt.blockNumber);
      if (!block) {
        throw new Error('Block not found');
      }
      const finalLastFeeTimestamp = await adminVault.lastFeeTimestamp(safeAddr, YEARN_USDC_ADDRESS);
      expect(finalLastFeeTimestamp).to.equal(BigInt(block.timestamp));
    });
  });

  describe('Yearn Withdraw', () => {
    beforeEach(async () => {
      // Do an empty deposit to initialize the fee timestamp
      await executeAction({
        type: 'YearnSupply',
      });
    });

    it('Should withdraw USDC', async () => {
      const amount = ethers.parseUnits('100', tokenConfig.yUSDC.decimals);
      await fundAccountWithToken(safeAddr, 'yUSDC', amount);

      const initialUSDCBalance = await USDC.balanceOf(safeAddr);
      const initialyUSDCBalance = await yUSDC.balanceOf(safeAddr);

      const tx = await executeAction({
        type: 'YearnWithdraw',
        amount,
      });

      const finalUSDCBalance = await USDC.balanceOf(safeAddr);
      const finalyUSDCBalance = await yUSDC.balanceOf(safeAddr);
      expect(finalUSDCBalance).to.be.greaterThan(initialUSDCBalance);
      expect(finalyUSDCBalance).to.be.lessThan(initialyUSDCBalance);
    });

    it('Should emit the correct log on withdraw', async () => {
      const amount = ethers.parseUnits('100', tokenConfig.yUSDC.decimals);
      await fundAccountWithToken(safeAddr, 'yUSDC', amount);
      const strategyId: number = 42;
      const poolId: BytesLike = ethers.keccak256(YEARN_USDC_ADDRESS).slice(0, 10);

      const tx = await executeAction({
        type: 'YearnWithdraw',
        amount,
      });

      const logs = await decodeLoggerLog(tx, loggerAddress);
      log('Logs:', logs);

      expect(logs).to.have.length(1);
      expect(logs[0]).to.have.property('eventName', 'BalanceUpdate');

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
      const yearnWithdrawContractAddress = await yearnWithdrawContract.getAddress();
      await fundAccountWithToken(yearnWithdrawContractAddress, 'yUSDC', 100);

      await yearnWithdrawContract.exit(YEARN_USDC_ADDRESS);

      expect(await yUSDC.balanceOf(yearnWithdrawContractAddress)).to.be.equal(BigInt(0));
    });

    it('Should withdraw the maximum amount of yUSDC', async () => {
      const amount = ethers.parseUnits('100', tokenConfig.yUSDC.decimals);
      await fundAccountWithToken(safeAddr, 'yUSDC', amount);

      expect(await yUSDC.balanceOf(safeAddr)).to.equal(amount);
      expect(await USDC.balanceOf(safeAddr)).to.equal(0);

      await executeAction({
        type: 'YearnWithdraw',
        amount: ethers.MaxUint256,
      });

      expect(await yUSDC.balanceOf(safeAddr)).to.equal(0);
      expect(await USDC.balanceOf(safeAddr)).to.be.greaterThan(0);
    });

    it('Should take fees', async () => {
      const amount = ethers.parseUnits('100', tokenConfig.USDC.decimals);

      await fundAccountWithToken(safeAddr, 'USDC', amount);

      const feeRecipient = await adminVault.feeRecipient();
      const feeRecipientUSDCBalanceBefore = await USDC.balanceOf(feeRecipient);
      const feeRecipientyUSDCBalanceBefore = await yUSDC.balanceOf(feeRecipient);

      const supplyTx = await executeAction({
        type: 'YearnSupply',
        amount,
      });

      const yUSDCBalanceAfterSupply = await yUSDC.balanceOf(safeAddr);

      const initialFeeTimestamp = await adminVault.lastFeeTimestamp(safeAddr, YEARN_USDC_ADDRESS);
      const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365); // add 1 year to the initial timestamp

      await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

      const withdrawTx = await executeAction({
        type: 'YearnWithdraw',
        feePercentage: 10,
        amount: '0',
      });

      const expectedFee = await calculateExpectedFee(
        supplyTx,
        withdrawTx,
        10,
        yUSDCBalanceAfterSupply
      );
      const expectedFeeRecipientBalance = feeRecipientyUSDCBalanceBefore + expectedFee;

      expect(await USDC.balanceOf(feeRecipient)).to.equal(feeRecipientUSDCBalanceBefore);
      expect(await yUSDC.balanceOf(feeRecipient)).to.equal(expectedFeeRecipientBalance);
    });

    it('Should have withdraw action type', async () => {
      const actionType = await yearnWithdrawContract.actionType();
      expect(actionType).to.equal(actionTypes.WITHDRAW_ACTION);
    });
  });
});

export {};
