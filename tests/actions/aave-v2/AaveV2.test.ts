import { expect, ethers, Signer } from '../..';
import { network } from 'hardhat';
import {
  IERC20,
  AaveV2Supply,
  AaveV2Withdraw,
  ILendingPool,
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
import { AAVE_V2_POOL, tokenConfig } from '../../constants';
import { actionTypes } from '../../actions';

describe('Aave V2 tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let loggerAddress: string;
  let logger: Logger;
  let snapshotId: string;
  let USDC: IERC20;
  let USDT: IERC20;
  let aaveSupplyContract: AaveV2Supply;
  let aaveWithdrawContract: AaveV2Withdraw;
  let aaveSupplyAddress: string;
  let aaveWithdrawAddress: string;
  let aavePool: ILendingPool;
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
    // Fetch the USDC token
    USDC = await getUSDC();
    USDT = await getUSDT();

    // Initialize AaveSupply and AaveWithdraw actions
    aaveSupplyContract = await deploy(
      'AaveV2Supply',
      signer,
      await adminVault.getAddress(),
      loggerAddress,
      AAVE_V2_POOL
    );
    aaveWithdrawContract = await deploy(
      'AaveV2Withdraw',
      signer,
      await adminVault.getAddress(),
      loggerAddress,
      AAVE_V2_POOL
    );
    aaveSupplyAddress = await aaveSupplyContract.getAddress();
    aaveWithdrawAddress = await aaveWithdrawContract.getAddress();
    aavePool = await ethers.getContractAt('ILendingPool', AAVE_V2_POOL);

    // grant the USDC and USDT assets the POOL_ROLE
    await adminVault.proposeAction(getBytes4(aaveSupplyAddress), aaveSupplyAddress);
    await adminVault.proposeAction(getBytes4(aaveWithdrawAddress), aaveWithdrawAddress);
    await adminVault.addAction(getBytes4(aaveSupplyAddress), aaveSupplyAddress);
    await adminVault.addAction(getBytes4(aaveWithdrawAddress), aaveWithdrawAddress);
    await adminVault.proposePool('Aave', tokenConfig.aUSDC_V2.address);
    await adminVault.proposePool('Aave', tokenConfig.aUSDT_V2.address);
    await adminVault.addPool('Aave', tokenConfig.aUSDC_V2.address);
    await adminVault.addPool('Aave', tokenConfig.aUSDT_V2.address);
  });

  beforeEach(async () => {
    log('Taking local snapshot');
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    log('Reverting to local snapshot');
    await network.provider.send('evm_revert', [snapshotId]);
  });

  describe('Aave Supply', () => {
    it('Should deposit USDC', async () => {
      const supplyAmount = ethers.parseUnits('2000', tokenConfig.USDC.decimals);
      await fundAccountWithToken(safeAddr, 'USDC', supplyAmount);

      const initialUSDCBalance = await USDC.balanceOf(safeAddr);
      const initialAaveBalance = await aavePool.getUserAccountData(safeAddr);

      log('Executing supply action');
      log(getBytes4(tokenConfig.aUSDC_V2.address));
      log(supplyAmount.toString());

      // check adminVault has the pool
      const poolAddress = await adminVault.getPoolAddress(
        'Aave',
        getBytes4(tokenConfig.aUSDC_V2.address)
      );
      log('Pool address', poolAddress);

      await executeAction({
        type: 'AaveV2Supply',
        assetId: getBytes4(tokenConfig.aUSDC_V2.address),
        amount: supplyAmount.toString(),
      });

      const finalUSDCBalance = await USDC.balanceOf(safeAddr);
      const finalAaveBalance = await aavePool.getUserAccountData(safeAddr);

      expect(finalUSDCBalance).to.be.lt(initialUSDCBalance);
      expect(finalAaveBalance.totalCollateralETH).to.be.gt(initialAaveBalance.totalCollateralETH);
    });

    it('Should deposit USDT', async () => {
      const supplyAmount = ethers.parseUnits('2000', tokenConfig.USDT.decimals);
      await fundAccountWithToken(safeAddr, 'USDT', supplyAmount);
      // USDT is an isolated assest on Aave, so it doesn't increase your total collateral
      // so we need to check the balance of the aUSDT token
      const aUSDT = await ethers.getContractAt('IERC20', tokenConfig.aUSDT_V2.address);

      const initialUSDTBalance = await USDT.balanceOf(safeAddr);
      const initialAaveBalance = await aUSDT.balanceOf(safeAddr);

      await executeAction({
        type: 'AaveV2Supply',
        assetId: getBytes4(tokenConfig.aUSDT_V2.address),
        amount: supplyAmount.toString(),
      });
      const finalUSDTBalance = await USDT.balanceOf(safeAddr);
      const finalAaveBalance = await aUSDT.balanceOf(safeAddr);

      log('Final USDT balance', finalUSDTBalance);
      log('Initial USDT balance', initialUSDTBalance);
      log('Final Aave balance', finalAaveBalance);
      log('Initial Aave balance', initialAaveBalance);

      expect(finalUSDTBalance).to.be.lt(initialUSDTBalance);
      expect(finalAaveBalance).to.be.gt(initialAaveBalance);
    });

    it('Should deposit max', async () => {
      const amount = 1000;
      await fundAccountWithToken(safeAddr, 'USDC', amount);

      await executeAction({
        type: 'AaveV2Supply',
        assetId: getBytes4(tokenConfig.aUSDC_V2.address),
        amount: ethers.MaxUint256.toString(),
      });

      const finalUSDCBalance = await USDC.balanceOf(safeAddr);
      expect(finalUSDCBalance).to.be.equal(0n);
    });

    it('Should emit the correct log on deposit', async () => {
      const token = 'USDC';
      const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
      await fundAccountWithToken(safeAddr, token, amount);

      const strategyId: number = 42;

      const tx = await executeAction({
        type: 'AaveV2Supply',
        assetId: getBytes4(tokenConfig.aUSDC_V2.address),
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
      expect(txLog).to.have.property('poolId', getBytes4(tokenConfig.aUSDC_V2.address));
      expect(txLog).to.have.property('balanceBefore', 0n);
      expect(txLog).to.have.property('balanceAfter', amount);
      expect(txLog).to.have.property('feeInTokens', 0n);
      expect(txLog.balanceAfter).to.be.a('bigint');
      expect(txLog.balanceAfter).to.not.equal(BigInt(0));
    });
    it('Should have the deposit action type', async () => {
      const actionType = await aaveSupplyContract.actionType();
      expect(actionType).to.equal(actionTypes.DEPOSIT_ACTION);
    });
    it('Should initialize the last fee timestamp', async () => {
      const lastFeeTimestamp = await adminVault.lastFeeTimestamp(
        safeAddr,
        tokenConfig.aUSDC_V2.address
      );
      expect(lastFeeTimestamp).to.equal(0n);

      await executeAction({
        type: 'AaveV2Supply',
        assetId: getBytes4(tokenConfig.aUSDC_V2.address),
        amount: '0',
      });

      const lastFeeTimestampAfter = await adminVault.lastFeeTimestamp(
        safeAddr,
        tokenConfig.aUSDC_V2.address
      );
      expect(lastFeeTimestampAfter).to.not.equal(0n);
    });
    it('Should reject invalid token', async () => {
      await expect(
        executeAction({
          type: 'AaveV2Supply',
          assetId: '0x00000000',
          amount: '1',
        })
      ).to.be.revertedWith('GS013');
    });
  });

  describe('Aave Withdraw', () => {
    it('Should withdraw USDC', async () => {
      await fundAccountWithToken(safeAddr, 'USDC', 100);
      await executeAction({
        type: 'AaveV2Supply',
        assetId: getBytes4(tokenConfig.aUSDC_V2.address),
        amount: '100',
      });

      const initialUSDCBalance = await USDC.balanceOf(safeAddr);

      await executeAction({
        type: 'AaveV2Withdraw',
        assetId: getBytes4(tokenConfig.aUSDC_V2.address),
        amount: '100',
      });

      const finalUSDCBalance = await USDC.balanceOf(safeAddr);
      expect(finalUSDCBalance).to.be.gt(initialUSDCBalance);
    });
    it('Should withdraw USDT', async () => {
      await fundAccountWithToken(safeAddr, 'USDT', 100);
      await executeAction({
        type: 'AaveV2Supply',
        assetId: getBytes4(tokenConfig.aUSDT_V2.address),
        amount: '100',
      });

      const initialUSDTBalance = await USDT.balanceOf(safeAddr);

      await executeAction({
        type: 'AaveV2Withdraw',
        assetId: getBytes4(tokenConfig.aUSDT_V2.address),
        amount: '100',
      });

      const finalUSDTBalance = await USDT.balanceOf(safeAddr);
      expect(finalUSDTBalance).to.be.gt(initialUSDTBalance);
    });

    it('Should emit the correct log on withdraw', async () => {
      const token = 'aUSDC_V2';
      const amount = ethers.parseUnits('100', tokenConfig.USDC.decimals);
      await fundAccountWithToken(safeAddr, 'USDC', amount);
      const strategyId: number = 42;

      // initialize the last fee timestamp
      await executeAction({
        type: 'AaveV2Supply',
        assetId: getBytes4(tokenConfig[token].address),
        amount: amount.toString(),
      });

      const withdrawTx = await executeAction({
        type: 'AaveV2Withdraw',
        assetId: getBytes4(tokenConfig[token].address),
        amount: amount.toString(),
      });

      const logs = await decodeLoggerLog(withdrawTx);
      log('Logs:', logs);

      // we should expect 1 log, with the correct args
      expect(logs).to.have.length(1);
      expect(logs[0]).to.have.property('eventId', BigInt(ACTION_LOG_IDS.BALANCE_UPDATE));

      const aUSDC = await ethers.getContractAt('IERC20', tokenConfig[token].address);
      const finalaUSDCBalance = await aUSDC.balanceOf(safeAddr);

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
      expect(txLog.balanceAfter).to.be.greaterThanOrEqual(finalaUSDCBalance);
    });

    it('Should use the exit function to withdraw', async () => {
      const aaveWithdrawContractAddress = await aaveWithdrawContract.getAddress();
      await fundAccountWithToken(aaveWithdrawContractAddress, 'aUSDC_V2', 100);
      await fundAccountWithToken(aaveWithdrawContractAddress, 'aUSDT_V2', 100);

      await aaveWithdrawContract.exit(tokenConfig.aUSDC_V2.address);
      expect(await USDC.balanceOf(aaveWithdrawContractAddress)).to.be.gt(BigInt(0));

      await aaveWithdrawContract.exit(tokenConfig.aUSDT_V2.address);
      expect(await USDT.balanceOf(aaveWithdrawContractAddress)).to.be.gt(BigInt(0));
    });

    it('Should withdraw the maximum amount of aUSDC', async () => {
      const token = 'USDC';
      const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
      await fundAccountWithToken(safeAddr, token, amount);

      await executeAction({
        type: 'AaveV2Supply',
        assetId: getBytes4(tokenConfig.aUSDC_V2.address),
        amount: amount.toString(),
      });

      const initialUSDCBalance = await USDC.balanceOf(safeAddr);

      await executeAction({
        type: 'AaveV2Withdraw',
        assetId: getBytes4(tokenConfig.aUSDC_V2.address),
        amount: ethers.MaxUint256.toString(),
      });

      const aUSDC = await ethers.getContractAt('IERC20', tokenConfig.aUSDC_V2.address);
      const finalUSDCBalance = await USDC.balanceOf(safeAddr);
      const finalaUSDCBalance = await aUSDC.balanceOf(safeAddr);
      expect(finalUSDCBalance).to.be.gt(initialUSDCBalance);
      expect(finalaUSDCBalance).to.be.equal(0n);
    });

    it('Should take fees', async () => {
      const token = 'USDC';
      const amount = ethers.parseUnits('100', tokenConfig[token].decimals);

      await fundAccountWithToken(safeAddr, token, amount);

      const aUSDC = await ethers.getContractAt('IERC20', tokenConfig.aUSDC_V2.address);
      const feeRecipient = await adminVault.feeRecipient();
      const feeRecipientaUSDCBalanceBefore = await aUSDC.balanceOf(feeRecipient);

      const supplyTx = await executeAction({
        type: 'AaveV2Supply',
        assetId: getBytes4(tokenConfig.aUSDC_V2.address),
        amount: amount.toString(),
        feeBasis: 10,
      });

      const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
        safeAddr,
        tokenConfig.aUSDC_V2.address
      );

      const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365); // add 1 year to the initial timestamp

      // now time travel
      await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

      //check the balance of the fee recipient
      expect(await aUSDC.balanceOf(feeRecipient)).to.equal(0n);

      const withdrawTx = await executeAction({
        type: 'AaveV2Withdraw',
        assetId: getBytes4(tokenConfig.aUSDC_V2.address),
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
      const expectedFeeRecipientBalance = feeRecipientaUSDCBalanceBefore + expectedFee;

      // With Aave we earn extra tokens over time, so the fee recipient should have more than the expected fee
      expect(await aUSDC.balanceOf(feeRecipient)).to.be.greaterThanOrEqual(
        expectedFeeRecipientBalance
      );
    });

    it('Should have withdraw action type', async () => {
      const actionType = await aaveWithdrawContract.actionType();
      expect(actionType).to.equal(actionTypes.WITHDRAW_ACTION);
    });

    it('Should reject invalid token', async () => {
      const supplyAmount = ethers.parseUnits('2000', tokenConfig.USDC.decimals);
      await fundAccountWithToken(safeAddr, 'USDC', supplyAmount);
      await expect(
        executeAction({
          type: 'AaveV2Supply',
          assetId: '0x00000000',
          amount: supplyAmount.toString(),
        })
      ).to.be.revertedWith('GS013');
    });
  });
});

export {};
