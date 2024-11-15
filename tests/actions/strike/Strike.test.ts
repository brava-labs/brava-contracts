import { network } from 'hardhat';
import { ethers, expect, Signer } from '../..';
import { AdminVault, CTokenInterface, IERC20, Logger, StrikeSupply, StrikeWithdraw } from '../../../typechain-types';
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
  log
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
  let sUSDC: CTokenInterface;
  let sUSDT: CTokenInterface;
  let strikeSupplyContract: StrikeSupply;
  let strikeWithdrawContract: StrikeWithdraw;
  let strikeSupplyAddress: string;
  let strikeWithdrawAddress: string;
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
    sUSDC = await ethers.getContractAt('CTokenInterface', tokenConfig.sUSDC.address);
    sUSDT = await ethers.getContractAt('CTokenInterface', tokenConfig.sUSDT.address);

    strikeSupplyContract = await deploy(
      'StrikeSupply',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    strikeWithdrawContract = await deploy(
      'StrikeWithdraw',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    strikeSupplyAddress = await strikeSupplyContract.getAddress();
    strikeWithdrawAddress = await strikeWithdrawContract.getAddress();

    // grant the USDC and USDT assets the POOL_ROLE
    await adminVault.proposeAction(getBytes4(strikeSupplyAddress), strikeSupplyAddress);
    await adminVault.proposeAction(getBytes4(strikeWithdrawAddress), strikeWithdrawAddress);
    await adminVault.addAction(getBytes4(strikeSupplyAddress), strikeSupplyAddress);
    await adminVault.addAction(getBytes4(strikeWithdrawAddress), strikeWithdrawAddress);
    await adminVault.proposePool('Strike', tokenConfig.sUSDC.address);
    await adminVault.proposePool('Strike', tokenConfig.sUSDT.address);
    await adminVault.addPool('Strike', tokenConfig.sUSDC.address);
    await adminVault.addPool('Strike', tokenConfig.sUSDT.address);
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
    it('Should deposit USDC', async () => {
      const supplyAmount = ethers.parseUnits('2000', tokenConfig.USDC.decimals);
      await fundAccountWithToken(safeAddr, 'USDC', supplyAmount);

      const initialUSDCBalance = await USDC.balanceOf(safeAddr);
      const initialStrikeBalance = await sUSDC.balanceOf(safeAddr);

      log('Executing supply action');
      log(getBytes4(tokenConfig.sUSDC.address));
      log(supplyAmount.toString());

      // check adminVault has the pool
      const poolAddress = await adminVault.getPoolAddress(
        'Strike',
        getBytes4(tokenConfig.sUSDC.address)
      );
      log('Pool address', poolAddress);

      await executeAction({
        type: 'StrikeSupply',
        assetId: getBytes4(tokenConfig.sUSDC.address),
        amount: supplyAmount.toString(),
      });

      const finalUSDCBalance = await USDC.balanceOf(safeAddr);
      const finalStrikeBalance = await sUSDC.balanceOf(safeAddr);

      expect(finalUSDCBalance).to.be.lt(initialUSDCBalance);
      expect(finalStrikeBalance).to.be.gt(initialStrikeBalance);
    });

    it('Should deposit USDT', async () => {
      const supplyAmount = ethers.parseUnits('2000', tokenConfig.USDT.decimals);
      await fundAccountWithToken(safeAddr, 'USDT', supplyAmount);
      const initialUSDTBalance = await USDT.balanceOf(safeAddr);
      const initialStrikeBalance = await sUSDT.balanceOf(safeAddr);

      await executeAction({
        type: 'StrikeSupply',
        assetId: getBytes4(tokenConfig.sUSDT.address),
        amount: supplyAmount.toString(),
      });
      const finalUSDTBalance = await USDT.balanceOf(safeAddr);
      const finalStrikeBalance = await sUSDT.balanceOf(safeAddr);

      log('Final USDT balance', finalUSDTBalance);
      log('Initial USDT balance', initialUSDTBalance);
      log('Final Strike balance', finalStrikeBalance);
      log('Initial Strike balance', initialStrikeBalance);

      expect(finalUSDTBalance).to.be.lt(initialUSDTBalance);
      expect(finalStrikeBalance).to.be.gt(initialStrikeBalance);
    });

    it('Should deposit max', async () => {
      const amount = 1000;
      await fundAccountWithToken(safeAddr, 'USDC', amount);

      await executeAction({
        type: 'StrikeSupply',
        assetId: getBytes4(tokenConfig.sUSDC.address),
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
        type: 'StrikeSupply',
        assetId: getBytes4(tokenConfig.sUSDC.address),
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
      expect(txLog).to.have.property('poolId', getBytes4(tokenConfig.sUSDC.address));
      expect(txLog).to.have.property('balanceBefore', 0n);
      expect(txLog).to.have.property('balanceAfter');
      expect(txLog).to.have.property('feeInTokens', 0n);
      expect(txLog.balanceAfter).to.be.a('bigint');
      expect(txLog.balanceAfter).to.not.equal(BigInt(0));
    });
    it('Should have the deposit action type', async () => {
      const actionType = await strikeSupplyContract.actionType();
      expect(actionType).to.equal(actionTypes.DEPOSIT_ACTION);
    });
    it('Should initialize the last fee timestamp', async () => {
      const lastFeeTimestamp = await adminVault.lastFeeTimestamp(
        safeAddr,
        tokenConfig.sUSDC.address
      );
      expect(lastFeeTimestamp).to.equal(0n);

      await executeAction({
        type: 'StrikeSupply',
        assetId: getBytes4(tokenConfig.sUSDC.address),
        amount: '0',
      });

      const lastFeeTimestampAfter = await adminVault.lastFeeTimestamp(
        safeAddr,
        tokenConfig.sUSDC.address
      );
      expect(lastFeeTimestampAfter).to.not.equal(0n);
    });
    it('Should reject invalid token', async () => {
      await expect(
        executeAction({
          type: 'StrikeSupply',
          assetId: '0x00000000',
          amount: '1',
        })
      ).to.be.revertedWith('GS013');
    });
  });

  describe('Strike Withdraw', () => {
    it('Should withdraw USDC', async () => {
      // Initialize the fee timestamp for sUSDC
      await executeAction({
        type: 'StrikeSupply',
        assetId: getBytes4(tokenConfig.sUSDC.address),
        amount: '0',
      });
      const amount = ethers.parseUnits('100', tokenConfig.sUSDC.decimals);
      await fundAccountWithToken(safeAddr, 'sUSDC', amount);

      const initialUSDCBalance = await USDC.balanceOf(safeAddr);
      const initialStrikeBalance = await sUSDC.balanceOf(safeAddr);
      const initialUnderlyingBalance = await sUSDC.balanceOfUnderlying.staticCall(safeAddr);

      const tx = await executeAction({
        type: 'StrikeWithdraw',
        assetId: getBytes4(tokenConfig.sUSDC.address),
        amount: ethers.MaxUint256.toString(),
      });

      const finalUSDCBalance = await USDC.balanceOf(safeAddr);
      const finalStrikeBalance = await sUSDC.balanceOf(safeAddr);
      expect(finalUSDCBalance).to.equal(initialUSDCBalance + initialUnderlyingBalance);
      expect(finalStrikeBalance).to.be.lessThan(initialStrikeBalance);
    });
    it('Should withdraw USDT', async () => {
      // Initialize the fee timestamp for sUSDT
      await executeAction({
        type: 'StrikeSupply',
        assetId: getBytes4(tokenConfig.sUSDT.address),
        amount: '0',
      });
      const amount = ethers.parseUnits('100', tokenConfig.sUSDT.decimals);
      await fundAccountWithToken(safeAddr, 'sUSDT', amount);

      const initialUSDTBalance = await USDT.balanceOf(safeAddr);
      const initialStrikeBalance = await sUSDT.balanceOf(safeAddr);
      const initialUnderlyingBalance = await sUSDT.balanceOfUnderlying.staticCall(safeAddr);

      const tx = await executeAction({
        type: 'StrikeWithdraw',
        assetId: getBytes4(tokenConfig.sUSDT.address),
        amount: ethers.MaxUint256.toString(),
      });

      const finalUSDTBalance = await USDT.balanceOf(safeAddr);
      const finalStrikeBalance = await sUSDT.balanceOf(safeAddr);
      expect(finalUSDTBalance).to.equal(initialUSDTBalance + initialUnderlyingBalance);
      expect(finalStrikeBalance).to.be.lessThan(initialStrikeBalance);
    });

    it('Should emit the correct log on withdraw', async () => {
      const token = 'sUSDC';
      const amount = ethers.parseUnits('100', tokenConfig.USDC.decimals);
      await fundAccountWithToken(safeAddr, 'USDC', amount);
      const strategyId: number = 42;

      // initialize the last fee timestamp
      await executeAction({
        type: 'StrikeSupply',
        assetId: getBytes4(tokenConfig[token].address),
        amount: amount.toString(),
      });

      const initialStrikeBalance = await sUSDC.balanceOf(safeAddr);

      const withdrawTx = await executeAction({
        type: 'StrikeWithdraw',
        assetId: getBytes4(tokenConfig[token].address),
        amount: amount.toString(),
      });

      const logs = await decodeLoggerLog(withdrawTx);
      log('Logs:', logs);

      // we should expect 1 log, with the correct args
      expect(logs).to.have.length(1);
      expect(logs[0]).to.have.property('eventId', BigInt(ACTION_LOG_IDS.BALANCE_UPDATE));

      const finalsUSDCBalance = await sUSDC.balanceOf(safeAddr);

      // we know it's a BalanceUpdateLog because of the eventName
      // now we can typecast and check specific properties
      const txLog = logs[0] as BalanceUpdateLog;
      expect(txLog).to.have.property('safeAddress', safeAddr);
      expect(txLog).to.have.property('strategyId', BigInt(strategyId));
      expect(txLog).to.have.property('poolId', getBytes4(tokenConfig[token].address));
      expect(txLog).to.have.property('balanceBefore', initialStrikeBalance);
      expect(txLog).to.have.property('balanceAfter');
      expect(txLog).to.have.property('feeInTokens');
      expect(txLog.balanceAfter).to.be.a('bigint');
      // If the test runs slowly then the balanceAfter may have gained interest
      expect(txLog.balanceAfter).to.be.greaterThanOrEqual(finalsUSDCBalance);
    });

    it('Should use the exit function to withdraw', async () => {
      const strikeWithdrawContractAddress = await strikeWithdrawContract.getAddress();
      await fundAccountWithToken(strikeWithdrawContractAddress, 'sUSDC', 100);
      await fundAccountWithToken(strikeWithdrawContractAddress, 'sUSDT', 100);

      await strikeWithdrawContract.exit(tokenConfig.sUSDC.address);
      expect(await USDC.balanceOf(strikeWithdrawContractAddress)).to.be.gt(BigInt(0));

      await strikeWithdrawContract.exit(tokenConfig.sUSDT.address);
      expect(await USDT.balanceOf(strikeWithdrawContractAddress)).to.be.gt(BigInt(0));
    });

    it('Should withdraw the maximum amount of sUSDC', async () => {
      const token = 'USDC';
      const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
      await fundAccountWithToken(safeAddr, token, amount);

      await executeAction({
        type: 'StrikeSupply',
        assetId: getBytes4(tokenConfig.sUSDC.address),
        amount: amount.toString(),
      });

      const initialUSDCBalance = await USDC.balanceOf(safeAddr);

      await executeAction({
        type: 'StrikeWithdraw',
        assetId: getBytes4(tokenConfig.sUSDC.address),
        amount: ethers.MaxUint256.toString(),
      });

      const sUSDC = await ethers.getContractAt('IERC20', tokenConfig.sUSDC.address);
      const finalUSDCBalance = await USDC.balanceOf(safeAddr);
      const finalsUSDCBalance = await sUSDC.balanceOf(safeAddr);
      expect(finalUSDCBalance).to.be.gt(initialUSDCBalance);
    });

    it('Should take fees', async () => {
      const token = 'USDC';
      const amount = ethers.parseUnits('100', tokenConfig[token].decimals);

      await fundAccountWithToken(safeAddr, token, amount);

      const sUSDC = await ethers.getContractAt('IERC20', tokenConfig.sUSDC.address);
      const feeConfig = await adminVault.feeConfig();
      const feeRecipient = feeConfig.recipient;
      const feeRecipientSUSDCBalanceBefore = await sUSDC.balanceOf(feeRecipient);

      const supplyTx = await executeAction({
        type: 'StrikeSupply',
        assetId: getBytes4(tokenConfig.sUSDC.address),
        amount: amount.toString(),
        feeBasis: 10,
      });

      const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
        safeAddr,
        tokenConfig.sUSDC.address
      );

      const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365); // add 1 year to the initial timestamp

      // now time travel
      await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

      //check the balance of the fee recipient
      expect(await sUSDC.balanceOf(feeRecipient)).to.equal(0n);

      const withdrawTx = await executeAction({
        type: 'StrikeWithdraw',
        assetId: getBytes4(tokenConfig.sUSDC.address),
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
      const expectedFeeRecipientBalance = feeRecipientSUSDCBalanceBefore + expectedFee;

      // With Aave we earn extra tokens over time, so the fee recipient should have more than the expected fee
      expect(await sUSDC.balanceOf(feeRecipient)).to.be.greaterThanOrEqual(
        expectedFeeRecipientBalance
      );
    });

    it('Should have withdraw action type', async () => {
      const actionType = await strikeWithdrawContract.actionType();
      expect(actionType).to.equal(actionTypes.WITHDRAW_ACTION);
    });

    it('Should reject invalid token', async () => {
      const supplyAmount = ethers.parseUnits('2000', tokenConfig.USDC.decimals);
      await fundAccountWithToken(safeAddr, 'USDC', supplyAmount);
      await expect(
        executeAction({
          type: 'StrikeWithdraw',
          assetId: '0x00000000',
          amount: supplyAmount.toString(),
        })
      ).to.be.revertedWith('GS013');
    });
  });
});

export { };

