import { network } from 'hardhat';
import { ethers, expect, Signer } from '../..';
import {
  AdminVault,
  IERC20,
  ILendingPool,
  Logger,
  UwULendSupply,
  UwULendWithdraw
} from '../../../typechain-types';
import { actionTypes } from '../../actions';
import { tokenConfig, UWU_LEND_POOL } from '../../constants';
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
import { fundAccountWithToken, getDAI, getUSDT } from '../../utils-stable';

describe('UwULend tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let loggerAddress: string;
  let logger: Logger;
  let snapshotId: string;
  let USDT: IERC20;
  let DAI: IERC20;
  let uwulendSupplyContract: UwULendSupply;
  let uwulendWithdrawContract: UwULendWithdraw;
  let uwulendSupplyAddress: string;
  let uwulendWithdrawAddress: string;
  let uwulendPool: ILendingPool;
  let adminVault: AdminVault;

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
    DAI = await getDAI();
    USDT = await getUSDT();

    // Initialize AaveSupply and AaveWithdraw actions
    uwulendSupplyContract = await deploy(
      'UwULendSupply',
      signer,
      await adminVault.getAddress(),
      loggerAddress,
      UWU_LEND_POOL
    );
    uwulendWithdrawContract = await deploy(
      'UwULendWithdraw',
      signer,
      await adminVault.getAddress(),
      loggerAddress,
      UWU_LEND_POOL
    );
    uwulendSupplyAddress = await uwulendSupplyContract.getAddress();
    uwulendWithdrawAddress = await uwulendWithdrawContract.getAddress();
    uwulendPool = await ethers.getContractAt('ILendingPool', UWU_LEND_POOL);

    // grant the USDC and USDT assets the POOL_ROLE
    await adminVault.proposeAction(getBytes4(uwulendSupplyAddress), uwulendSupplyAddress);
    await adminVault.proposeAction(getBytes4(uwulendWithdrawAddress), uwulendWithdrawAddress);
    await adminVault.addAction(getBytes4(uwulendSupplyAddress), uwulendSupplyAddress);
    await adminVault.addAction(getBytes4(uwulendWithdrawAddress), uwulendWithdrawAddress);
    await adminVault.proposePool('UwULend', tokenConfig.uDAI.address);
    await adminVault.proposePool('UwULend', tokenConfig.uUSDT.address);
    await adminVault.addPool('UwULend', tokenConfig.uDAI.address);
    await adminVault.addPool('UwULend', tokenConfig.uUSDT.address);
  });

  beforeEach(async () => {
    log('Taking local snapshot');
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    log('Reverting to local snapshot');
    await network.provider.send('evm_revert', [snapshotId]);
  });

  describe('UwULend Supply', () => {
    it('Should deposit USDT', async () => {
      const supplyAmount = ethers.parseUnits('2000', tokenConfig.USDT.decimals);
      await fundAccountWithToken(safeAddr, 'USDT', supplyAmount);
      // USDT is an isolated assest on Aave, so it doesn't increase your total collateral
      // so we need to check the balance of the aUSDT token
      const aUSDT = await ethers.getContractAt('IERC20', tokenConfig.uUSDT.address);

      const initialUSDTBalance = await USDT.balanceOf(safeAddr);
      const initialUwULendBalance = await aUSDT.balanceOf(safeAddr);

      await executeAction({
        type: 'UwULendSupply',
        assetId: getBytes4(tokenConfig.uUSDT.address),
        amount: supplyAmount.toString(),
      });
      const finalUSDTBalance = await USDT.balanceOf(safeAddr);
      const finalUwULendBalance = await aUSDT.balanceOf(safeAddr);

      log('Final USDT balance', finalUSDTBalance);
      log('Initial USDT balance', initialUSDTBalance);
      log('Final UwULend balance', finalUwULendBalance);
      log('Initial UwULend balance', initialUwULendBalance);

      expect(finalUSDTBalance).to.be.lt(initialUSDTBalance);
      expect(finalUwULendBalance).to.be.gt(initialUwULendBalance);
    });
    it('Should deposit DAI', async () => {
      const supplyAmount = ethers.parseUnits('2000', tokenConfig.DAI.decimals);
      await fundAccountWithToken(safeAddr, 'DAI', supplyAmount);
      const uDAI = await ethers.getContractAt('IERC20', tokenConfig.uDAI.address);

      const initialDAIBalance = await DAI.balanceOf(safeAddr);
      const initialUwULendBalance = await uDAI.balanceOf(safeAddr);

      await executeAction({
        type: 'UwULendSupply',
        assetId: getBytes4(tokenConfig.uDAI.address),
        amount: supplyAmount.toString(),
      });
      const finalDAIBalance = await DAI.balanceOf(safeAddr);
      const finalUwULendBalance = await uDAI.balanceOf(safeAddr);

      log('Final DAI balance', finalDAIBalance);
      log('Initial DAI balance', initialDAIBalance);
      log('Final UwULend balance', finalUwULendBalance);
      log('Initial UwULend balance', initialUwULendBalance);

      expect(finalDAIBalance).to.be.lt(initialDAIBalance);
      expect(finalUwULendBalance).to.be.gt(initialUwULendBalance);
    });

    it('Should deposit max', async () => {
      const amount = 1000;
      await fundAccountWithToken(safeAddr, 'USDT', amount);

      await executeAction({
        type: 'UwULendSupply',
        assetId: getBytes4(tokenConfig.uUSDT.address),
        amount: ethers.MaxUint256.toString(),
      });

      const finalUSDTBalance = await USDT.balanceOf(safeAddr);
      expect(finalUSDTBalance).to.be.equal(0n);
    });

    it('Should emit the correct log on deposit', async () => {
      const token = 'USDT';
      const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
      await fundAccountWithToken(safeAddr, token, amount);

      const strategyId: number = 42;

      const tx = await executeAction({
        type: 'UwULendSupply',
        assetId: getBytes4(tokenConfig.uUSDT.address),
        amount: amount.toString(),
      });

      const logs = await decodeLoggerLog(tx);
      log('Logs:', logs);

      expect(logs).to.have.length(1);
      expect(logs[0]).to.have.property('eventId', BigInt(ACTION_LOG_IDS.BALANCE_UPDATE));

      // now we can typecast and check specific properties
      const txLog = logs[0] as BalanceUpdateLog;
      expect(txLog).to.have.property('safeAddress', safeAddr);
      expect(txLog).to.have.property('strategyId', BigInt(strategyId));
      expect(txLog).to.have.property('poolId', getBytes4(tokenConfig.uUSDT.address));
      expect(txLog).to.have.property('balanceBefore', 0n);
      expect(txLog).to.have.property('balanceAfter', amount);
      expect(txLog).to.have.property('feeInTokens', 0n);
      expect(txLog.balanceAfter).to.be.a('bigint');
      expect(txLog.balanceAfter).to.not.equal(BigInt(0));
    });
    it('Should have the deposit action type', async () => {
      const actionType = await uwulendSupplyContract.actionType();
      expect(actionType).to.equal(actionTypes.DEPOSIT_ACTION);
    });
    it('Should initialize the last fee timestamp', async () => {
      const lastFeeTimestamp = await adminVault.lastFeeTimestamp(
        safeAddr,
        tokenConfig.uUSDT.address
      );
      expect(lastFeeTimestamp).to.equal(0n);

      await executeAction({
        type: 'UwULendSupply',
        assetId: getBytes4(tokenConfig.uUSDT.address),
        amount: '0',
      });

      const lastFeeTimestampAfter = await adminVault.lastFeeTimestamp(
        safeAddr,
        tokenConfig.uUSDT.address
      );
      expect(lastFeeTimestampAfter).to.not.equal(0n);
    });
    it('Should reject invalid token', async () => {
      await expect(
        executeAction({
          type: 'UwULendSupply',
          assetId: '0x00000000',
          amount: '1',
        })
      ).to.be.revertedWith('GS013');
    });
  });

  describe('UwULend Withdraw', () => {
    it('Should withdraw USDT', async () => {
      await fundAccountWithToken(safeAddr, 'USDT', 100);
      await executeAction({
        type: 'UwULendSupply',
        assetId: getBytes4(tokenConfig.uUSDT.address),
        amount: '100',
      });

      const initialUSDTBalance = await USDT.balanceOf(safeAddr);

      await executeAction({
        type: 'UwULendWithdraw',
        assetId: getBytes4(tokenConfig.uUSDT.address),
        amount: '100',
      });

      const finalUSDTBalance = await USDT.balanceOf(safeAddr);
      expect(finalUSDTBalance).to.be.gt(initialUSDTBalance);
    });
    it('Should withdraw DAI', async () => {
      await fundAccountWithToken(safeAddr, 'DAI', 100);
      await executeAction({
        type: 'UwULendSupply',
        assetId: getBytes4(tokenConfig.uDAI.address),
        amount: '100',
      });

      const initialDAIBalance = await DAI.balanceOf(safeAddr);

      await executeAction({
        type: 'UwULendWithdraw',
        assetId: getBytes4(tokenConfig.uDAI.address),
        amount: '100',
      });

      const finalDAIBalance = await DAI.balanceOf(safeAddr);
      expect(finalDAIBalance).to.be.gt(initialDAIBalance);
    });

    it('Should emit the correct log on withdraw', async () => {
      const token = 'uUSDT';
      const amount = ethers.parseUnits('100', tokenConfig.uUSDT.decimals);
      await fundAccountWithToken(safeAddr, 'USDT', amount);
      const strategyId: number = 42;

      // initialize the last fee timestamp
      await executeAction({
        type: 'UwULendSupply',
        assetId: getBytes4(tokenConfig[token].address),
        amount: amount.toString(),
      });

      const withdrawTx = await executeAction({
        type: 'UwULendWithdraw',
        assetId: getBytes4(tokenConfig[token].address),
        amount: amount.toString(),
      });

      const logs = await decodeLoggerLog(withdrawTx);
      log('Logs:', logs);

      // we should expect 1 log, with the correct args
      expect(logs).to.have.length(1);
      expect(logs[0]).to.have.property('eventId', BigInt(ACTION_LOG_IDS.BALANCE_UPDATE));

      const uUSDT = await ethers.getContractAt('IERC20', tokenConfig.uUSDT.address);
      const finaluUSDTBalance = await uUSDT.balanceOf(safeAddr);

      // we know it's a BalanceUpdateLog because of the eventName
      // now we can typecast and check specific properties
      const txLog = logs[0] as BalanceUpdateLog;
      expect(txLog).to.have.property('safeAddress', safeAddr);
      expect(txLog).to.have.property('strategyId', BigInt(strategyId));
      expect(txLog).to.have.property('poolId', getBytes4(tokenConfig[token].address));
      expect(txLog).to.have.property('balanceBefore', amount);
      expect(txLog).to.have.property('balanceAfter');
      expect(txLog).to.have.property('feeInTokens');
      expect(txLog.balanceAfter).to.be.a('bigint');
      // If the test runs slowly then the balanceAfter may have gained interest
      expect(txLog.balanceAfter).to.be.greaterThanOrEqual(finaluUSDTBalance);
    });

    it('Should use the exit function to withdraw', async () => {
      const uwulendWithdrawContractAddress = await uwulendWithdrawContract.getAddress();
      await fundAccountWithToken(uwulendWithdrawContractAddress, 'uUSDT', 100);

      await uwulendWithdrawContract.exit(tokenConfig.uUSDT.address);
      expect(await USDT.balanceOf(uwulendWithdrawContractAddress)).to.be.gt(BigInt(0));
    });

    it('Should withdraw the maximum amount of uUSDT', async () => {
      const token = 'USDT';
      const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
      await fundAccountWithToken(safeAddr, token, amount);

      await executeAction({
        type: 'UwULendSupply',
        assetId: getBytes4(tokenConfig.uUSDT.address),
        amount: amount.toString(),
      });

      const initialUSDTBalance = await USDT.balanceOf(safeAddr);

      await executeAction({
        type: 'UwULendWithdraw',
        assetId: getBytes4(tokenConfig.uUSDT.address),
        amount: ethers.MaxUint256.toString(),
      });

      const uUSDT = await ethers.getContractAt('IERC20', tokenConfig.uUSDT.address);
      const finalUSDTBalance = await USDT.balanceOf(safeAddr);
      const finaluUSDTBalance = await uUSDT.balanceOf(safeAddr);
      expect(finalUSDTBalance).to.be.gt(initialUSDTBalance);
      expect(finaluUSDTBalance).to.be.equal(0n);
    });

    it('Should take fees', async () => {
      const token = 'USDT';
      const amount = ethers.parseUnits('100', tokenConfig[token].decimals);

      await fundAccountWithToken(safeAddr, token, amount);

      const uUSDT = await ethers.getContractAt('IERC20', tokenConfig.uUSDT.address);
      const feeConfig = await adminVault.feeConfig();
      const feeRecipient = feeConfig.recipient;
      const feeRecipientuUSDTBalanceBefore = await uUSDT.balanceOf(feeRecipient);

      const supplyTx = await executeAction({
        type: 'UwULendSupply',
        assetId: getBytes4(tokenConfig.uUSDT.address),
        amount: amount.toString(),
        feeBasis: 10,
      });

      const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
        safeAddr,
        tokenConfig.uUSDT.address
      );

      const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365); // add 1 year to the initial timestamp

      // now time travel
      await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

      //check the balance of the fee recipient
      expect(await uUSDT.balanceOf(feeRecipient)).to.equal(0n);

      const withdrawTx = await executeAction({
        type: 'UwULendWithdraw',
        assetId: getBytes4(tokenConfig.uUSDT.address),
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
        amount
      );
      const expectedFeeRecipientBalance = feeRecipientuUSDTBalanceBefore + expectedFee;

      // With Aave we earn extra tokens over time, so the fee recipient should have more than the expected fee
      expect(await uUSDT.balanceOf(feeRecipient)).to.be.greaterThanOrEqual(
        expectedFeeRecipientBalance
      );
    });

    it('Should have withdraw action type', async () => {
      const actionType = await uwulendWithdrawContract.actionType();
      expect(actionType).to.equal(actionTypes.WITHDRAW_ACTION);
    });

    it('Should reject invalid token', async () => {
      const supplyAmount = ethers.parseUnits('2000', tokenConfig.USDT.decimals);
      await fundAccountWithToken(safeAddr, 'USDT', supplyAmount);
      await expect(
        executeAction({
          type: 'UwULendSupply',
          assetId: '0x00000000',
          amount: supplyAmount.toString(),
        })
      ).to.be.revertedWith('GS013');
    });
  });
});

export { };

