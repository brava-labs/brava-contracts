import { BytesLike } from 'ethers';
import { network } from 'hardhat';
import { ethers, expect, Signer } from '../..';
import { actionTypes } from '../../../tests/actions';
import { tokenConfig } from '../../../tests/constants';
import {
  AdminVault,
  GearboxPassiveSupply,
  GearboxPassiveWithdraw,
  IERC20,
  IERC4626,
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
import { fundAccountWithToken, getUSDC, getUSDT, getDAI } from '../../utils-stable';

describe('Gearbox Passive tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let loggerAddress: string;
  let logger: Logger;
  let snapshotId: string;
  let USDC: IERC20;
  let USDT: IERC20;
  let DAI: IERC20;
  let gearboxPassiveSupplyContract: GearboxPassiveSupply;
  let gearboxPassiveWithdrawContract: GearboxPassiveWithdraw;
  let gearboxPassiveSupplyAddress: string;
  let gearboxPassiveWithdrawAddress: string;
  let sdUSDCV3: IERC4626;
  let sdUSDTV3: IERC4626;
  let sdDAIV3: IERC4626;
  let adminVault: AdminVault;
  const GEARBOX_PASSIVE_USDC_ADDRESS = tokenConfig.sdUSDCV3.address;
  const GEARBOX_PASSIVE_USDT_ADDRESS = tokenConfig.sdUSDTV3.address;
  const GEARBOX_PASSIVE_DAI_ADDRESS = tokenConfig.sdDAIV3.address;

  // Run tests for each supported token
  const testCases: Array<{
    token: keyof typeof tokenConfig;
    poolAddress: string;
    sdToken: () => IERC4626;
  }> = [
    {
      token: 'USDC',
      poolAddress: tokenConfig.sdUSDCV3.address,
      sdToken: () => sdUSDCV3,
    },
    {
      token: 'USDT',
      poolAddress: tokenConfig.sdUSDTV3.address,
      sdToken: () => sdUSDTV3,
    },
    {
      token: 'DAI',
      poolAddress: tokenConfig.sdDAIV3.address,
      sdToken: () => sdDAIV3,
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
    USDT = await getUSDT();
    DAI = await getDAI();

    // Initialize GearboxPassiveSupply and GearboxPassiveWithdraw actions
    gearboxPassiveSupplyContract = await deploy(
      'GearboxPassiveSupply',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    gearboxPassiveWithdrawContract = await deploy(
      'GearboxPassiveWithdraw',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    gearboxPassiveSupplyAddress = await gearboxPassiveSupplyContract.getAddress();
    gearboxPassiveWithdrawAddress = await gearboxPassiveWithdrawContract.getAddress();
    sdUSDCV3 = await ethers.getContractAt('IERC4626', GEARBOX_PASSIVE_USDC_ADDRESS);
    sdUSDTV3 = await ethers.getContractAt('IERC4626', GEARBOX_PASSIVE_USDT_ADDRESS);
    sdDAIV3 = await ethers.getContractAt('IERC4626', GEARBOX_PASSIVE_DAI_ADDRESS);

    // Grant the sdUSDCV3, sdUSDTV3, and sdDAIV3 contracts the POOL_ROLE
    await adminVault.proposePool('Gearbox Passive', GEARBOX_PASSIVE_USDC_ADDRESS);
    await adminVault.proposePool('Gearbox Passive', GEARBOX_PASSIVE_USDT_ADDRESS);
    await adminVault.proposePool('Gearbox Passive', GEARBOX_PASSIVE_DAI_ADDRESS);
    await adminVault.addPool('Gearbox Passive', GEARBOX_PASSIVE_USDC_ADDRESS);
    await adminVault.addPool('Gearbox Passive', GEARBOX_PASSIVE_USDT_ADDRESS);
    await adminVault.addPool('Gearbox Passive', GEARBOX_PASSIVE_DAI_ADDRESS);
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

  describe('Gearbox Passive Supply', () => {
    testCases.forEach(({ token, poolAddress, sdToken }) => {
      describe(`Testing ${token}`, () => {
        it('Should deposit', async () => {
          const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialGearboxBalance = await sdToken().balanceOf(safeAddr);

          await executeAction({
            type: 'GearboxPassiveSupply',
            poolAddress,
            amount,
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalsdTokenBalance = await sdToken().balanceOf(safeAddr);

          expect(finalTokenBalance).to.equal(initialTokenBalance - amount);
          expect(finalsdTokenBalance).to.be.greaterThan(initialGearboxBalance);
        });

        it('Should deposit max', async () => {
          const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialGearboxBalance = await sdToken().balanceOf(safeAddr);

          expect(initialTokenBalance).to.equal(amount);

          await executeAction({
            type: 'GearboxPassiveSupply',
            poolAddress,
            amount: ethers.MaxUint256,
          });

          expect(await tokenContract.balanceOf(safeAddr)).to.equal(0);
          expect(await sdToken().balanceOf(safeAddr)).to.be.greaterThan(initialGearboxBalance);
        });

        it('Should take fees on deposit', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          const feeConfig = await adminVault.feeConfig();
          const feeRecipient = feeConfig.recipient;
          const feeRecipientTokenBalanceBefore = await tokenContract.balanceOf(feeRecipient);
          const feeRecipientsdTokenBalanceBefore = await sdToken().balanceOf(feeRecipient);

          // Do an initial deposit
          const firstTx = await executeAction({
            type: 'GearboxPassiveSupply',
            poolAddress,
            amount,
            feeBasis: 10,
          });

          const sdTokenBalanceAfterFirstTx = await sdToken().balanceOf(safeAddr);

          // Time travel 1 year
          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
            safeAddr,
            poolAddress
          );
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          // Do another deposit to trigger fees
          const secondTx = await executeAction({
            type: 'GearboxPassiveSupply',
            poolAddress,
            amount: '0',
            feeBasis: 10,
          });

          const expectedFee = await calculateExpectedFee(
            (await firstTx.wait()) ??
              (() => {
                throw new Error('First deposit transaction failed');
              })(),
            (await secondTx.wait()) ??
              (() => {
                throw new Error('Second deposit transaction failed');
              })(),
            10,
            sdTokenBalanceAfterFirstTx
          );
          const expectedFeeRecipientBalance = feeRecipientsdTokenBalanceBefore + expectedFee;

          // Check fees were taken in sdTokens, not underlying
          expect(await tokenContract.balanceOf(feeRecipient)).to.equal(
            feeRecipientTokenBalanceBefore
          );
          expect(await sdToken().balanceOf(feeRecipient)).to.equal(expectedFeeRecipientBalance);
        });
      });
    });

    describe('General tests', () => {
      it('Should emit the correct log on deposit', async () => {
        const token = 'USDC';
        const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
        await fundAccountWithToken(safeAddr, token, amount);
        const strategyId: number = 42;
        const poolId: BytesLike = ethers.keccak256(GEARBOX_PASSIVE_USDC_ADDRESS).slice(0, 10);

        const tx = await executeAction({
          type: 'GearboxPassiveSupply',
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
          GEARBOX_PASSIVE_USDC_ADDRESS
        );
        expect(initialLastFeeTimestamp).to.equal(BigInt(0));

        await fundAccountWithToken(safeAddr, 'USDC', 1000);

        const tx = await executeAction({
          type: 'GearboxPassiveSupply',
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
          GEARBOX_PASSIVE_USDC_ADDRESS
        );
        expect(finalLastFeeTimestamp).to.equal(BigInt(block.timestamp));
      });

      it('Should have deposit action type', async () => {
        const actionType = await gearboxPassiveSupplyContract.actionType();
        expect(actionType).to.equal(actionTypes.DEPOSIT_ACTION);
      });

      it('Should reject invalid token', async () => {
        await expect(
          executeAction({
            type: 'GearboxPassiveSupply',
            poolAddress: '0x0000000000000000000000000000000000000000',
          })
        ).to.be.revertedWith('GS013');
      });
    });
  });

  describe('Gearbox Passive Withdraw', () => {
    beforeEach(async () => {
      // Do empty deposits to initialize the fee timestamps for all pools
      for (const { poolAddress } of testCases) {
        await executeAction({
          type: 'GearboxPassiveSupply',
          poolAddress,
          amount: '0',
        });
      }
    });

    testCases.forEach(({ token, poolAddress, sdToken }) => {
      describe(`Testing ${token}`, () => {
        it('Should withdraw', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, `sd${token}V3`, amount);

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialsdTokenBalance = await sdToken().balanceOf(safeAddr);

          await executeAction({
            type: 'GearboxPassiveWithdraw',
            poolAddress,
            amount,
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalsdTokenBalance = await sdToken().balanceOf(safeAddr);
          expect(finalTokenBalance).to.equal(initialTokenBalance + amount);
          expect(finalsdTokenBalance).to.be.lessThan(initialsdTokenBalance);
        });

        it('Should withdraw the maximum amount', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, `sd${token}V3`, amount);

          expect(await sdToken().balanceOf(safeAddr)).to.equal(amount);
          expect(await tokenContract.balanceOf(safeAddr)).to.equal(0);

          await executeAction({
            type: 'GearboxPassiveWithdraw',
            poolAddress,
            amount: ethers.MaxUint256,
          });

          expect(await sdToken().balanceOf(safeAddr)).to.equal(0);
          expect(await tokenContract.balanceOf(safeAddr)).to.be.greaterThan(0);
        });

        it('Should take fees on withdraw', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          const feeConfig = await adminVault.feeConfig();
          const feeRecipient = feeConfig.recipient;
          const feeRecipientTokenBalanceBefore = await tokenContract.balanceOf(feeRecipient);
          const feeRecipientsdTokenBalanceBefore = await sdToken().balanceOf(feeRecipient);

          const supplyTx = await executeAction({
            type: 'GearboxPassiveSupply',
            poolAddress,
            amount,
            feeBasis: 10,
          });

          const sdTokenBalanceAfterSupply = await sdToken().balanceOf(safeAddr);

          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
            safeAddr,
            poolAddress
          );
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          const withdrawTx = await executeAction({
            type: 'GearboxPassiveWithdraw',
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
            sdTokenBalanceAfterSupply
          );
          const expectedFeeRecipientBalance = feeRecipientsdTokenBalanceBefore + expectedFee;

          expect(await tokenContract.balanceOf(feeRecipient)).to.equal(
            feeRecipientTokenBalanceBefore
          );
          expect(await sdToken().balanceOf(feeRecipient)).to.equal(expectedFeeRecipientBalance);
        });
      });
    });

    describe('General tests', () => {
      it('Should emit the correct log on withdraw', async () => {
        const token = 'USDC';
        const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
        await fundAccountWithToken(safeAddr, `sd${token}V3`, amount);
        const strategyId: number = 42;
        const poolId: BytesLike = ethers.keccak256(GEARBOX_PASSIVE_USDC_ADDRESS).slice(0, 10);

        const tx = await executeAction({
          type: 'GearboxPassiveWithdraw',
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
        expect(txLog).to.have.property('balanceBefore');
        expect(txLog).to.have.property('balanceAfter');
        expect(txLog).to.have.property('feeInTokens');
        expect(txLog.balanceBefore).to.equal(amount);
        expect(txLog.balanceAfter).to.be.lt(txLog.balanceBefore);
        expect(txLog.feeInTokens).to.equal(BigInt(0));
      });

      it('Should have withdraw action type', async () => {
        const actionType = await gearboxPassiveWithdrawContract.actionType();
        expect(actionType).to.equal(actionTypes.WITHDRAW_ACTION);
      });

      it('Should reject invalid token', async () => {
        await expect(
          executeAction({
            type: 'GearboxPassiveWithdraw',
            poolAddress: '0x0000000000000000000000000000000000000000',
          })
        ).to.be.revertedWith('GS013');
      });
    });
  });
}); 

export {}; 