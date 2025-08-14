import { BytesLike } from 'ethers';
import { network } from 'hardhat';
import { ethers, expect, Signer } from '../..';
import { actionTypes } from '../../actions';
import { tokenConfig } from '../../constants';
import {
  AdminVault,
  GearboxPassiveV3Supply,
  GearboxPassiveV3Withdraw,
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
  getTypedContract,
  log,
} from '../../utils';
import { getBytes4 } from '../../shared-utils';
import { fundAccountWithToken, getTokenContract } from '../../utils-stable';

describe('GearboxPassiveV3 tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let loggerAddress: string;
  let logger: Logger;
  let snapshotId: string;
  let USDC: IERC20;
  let USDT: IERC20;
  let DAI: IERC20;
  let gearboxPassiveV3SupplyContract: GearboxPassiveV3Supply;
  let gearboxPassiveV3WithdrawContract: GearboxPassiveV3Withdraw;
  let gearboxPassiveV3SupplyAddress: string;
  let gearboxPassiveV3WithdrawAddress: string;
  let gearboxPassiveUSDC: IERC4626;
  let gearboxPassiveDAI: IERC4626;
  let gearboxPassiveK3USDT: IERC4626;
  let gearboxPassiveChaosGHO: IERC4626;
  let adminVault: AdminVault;
  const GEARBOX_PASSIVE_USDC_ADDRESS = tokenConfig.GEARBOX_PASSIVE_V3_USDC.address;
  const GEARBOX_PASSIVE_DAI_ADDRESS = tokenConfig.GEARBOX_PASSIVE_V3_DAI.address;
  const GEARBOX_PASSIVE_K3_USDT_ADDRESS = tokenConfig.GEARBOX_PASSIVE_V3_K3_USDT.address;
  const GEARBOX_PASSIVE_CHAOS_GHO_ADDRESS = tokenConfig.GEARBOX_PASSIVE_V3_CHAOS_GHO.address;

  // Run tests for each supported token
  const testCases: Array<{
    token: keyof typeof tokenConfig;
    poolAddress: string;
    sdToken: () => IERC4626;
  }> = [
    {
      token: 'USDC',
      poolAddress: tokenConfig.GEARBOX_PASSIVE_V3_USDC.address,
      sdToken: () => gearboxPassiveUSDC,
    },
    {
      token: 'DAI',
      poolAddress: tokenConfig.GEARBOX_PASSIVE_V3_DAI.address,
      sdToken: () => gearboxPassiveDAI,
    },
    {
      token: 'USDT',
      poolAddress: tokenConfig.GEARBOX_PASSIVE_V3_K3_USDT.address,
      sdToken: () => gearboxPassiveK3USDT,
    },
    {
      token: 'GHO',
      poolAddress: tokenConfig.GEARBOX_PASSIVE_V3_CHAOS_GHO.address,
      sdToken: () => gearboxPassiveChaosGHO,
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
    logger = await getTypedContract<Logger>('Logger', loggerAddress);
    adminVault = await baseSetup.adminVault;
    // Fetch the tokens
    USDC = await getTokenContract('USDC');
    USDT = await getTokenContract('USDT');
    DAI = await getTokenContract('DAI');

    // Initialize GearboxPassiveV3Supply and GearboxPassiveV3Withdraw actions
    gearboxPassiveV3SupplyContract = await deploy(
      'GearboxPassiveV3Supply',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    gearboxPassiveV3WithdrawContract = await deploy(
      'GearboxPassiveV3Withdraw',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    gearboxPassiveV3SupplyAddress = await gearboxPassiveV3SupplyContract.getAddress();
    gearboxPassiveV3WithdrawAddress = await gearboxPassiveV3WithdrawContract.getAddress();
    gearboxPassiveUSDC = await getTypedContract<IERC4626>('IERC4626', GEARBOX_PASSIVE_USDC_ADDRESS);
    gearboxPassiveDAI = await getTypedContract<IERC4626>('IERC4626', GEARBOX_PASSIVE_DAI_ADDRESS);
    gearboxPassiveK3USDT = await getTypedContract<IERC4626>(
      'IERC4626',
      GEARBOX_PASSIVE_K3_USDT_ADDRESS
    );
    gearboxPassiveChaosGHO = await getTypedContract<IERC4626>(
      'IERC4626',
      GEARBOX_PASSIVE_CHAOS_GHO_ADDRESS
    );

    // Grant the Gearbox Passive V3 contracts the POOL_ROLE
    await adminVault.proposePool('GearboxPassiveV3', GEARBOX_PASSIVE_USDC_ADDRESS);
    await adminVault.proposePool('GearboxPassiveV3', GEARBOX_PASSIVE_DAI_ADDRESS);
    await adminVault.proposePool('GearboxPassiveV3', GEARBOX_PASSIVE_K3_USDT_ADDRESS);
    await adminVault.proposePool('GearboxPassiveV3', GEARBOX_PASSIVE_CHAOS_GHO_ADDRESS);
    await adminVault.addPool('GearboxPassiveV3', GEARBOX_PASSIVE_USDC_ADDRESS);
    await adminVault.addPool('GearboxPassiveV3', GEARBOX_PASSIVE_DAI_ADDRESS);
    await adminVault.addPool('GearboxPassiveV3', GEARBOX_PASSIVE_K3_USDT_ADDRESS);
    await adminVault.addPool('GearboxPassiveV3', GEARBOX_PASSIVE_CHAOS_GHO_ADDRESS);

    // Register action contracts with AdminVault using deployed addresses for coverage compatibility
    const gearboxSupplyActionId = getBytes4(gearboxPassiveV3SupplyAddress);
    const gearboxWithdrawActionId = getBytes4(gearboxPassiveV3WithdrawAddress);

    await adminVault.proposeAction(gearboxSupplyActionId, gearboxPassiveV3SupplyAddress);
    await adminVault.proposeAction(gearboxWithdrawActionId, gearboxPassiveV3WithdrawAddress);
    await adminVault.addAction(gearboxSupplyActionId, gearboxPassiveV3SupplyAddress);
    await adminVault.addAction(gearboxWithdrawActionId, gearboxPassiveV3WithdrawAddress);
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

  describe('GearboxPassiveV3 Supply', () => {
    testCases.forEach(({ token, poolAddress, sdToken }) => {
      describe(`Testing ${token}`, () => {
        it('Should deposit', async () => {
          const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialGearboxBalance = await sdToken().balanceOf(safeAddr);

          await executeAction({
            type: 'GearboxPassiveV3Supply',
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
            type: 'GearboxPassiveV3Supply',
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
            type: 'GearboxPassiveV3Supply',
            poolAddress,
            amount,
            feeBasis: 10,
          });

          const sdTokenBalanceAfterFirstTx = await sdToken().balanceOf(safeAddr);

          // Time travel 1 year
          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(safeAddr, poolAddress);
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          // Do another deposit to trigger fees
          const secondTx = await executeAction({
            type: 'GearboxPassiveV3Supply',
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
          type: 'GearboxPassiveV3Supply',
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
          type: 'GearboxPassiveV3Supply',
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
        const actionType = await gearboxPassiveV3SupplyContract.actionType();
        expect(actionType).to.equal(actionTypes.DEPOSIT_ACTION);
      });

      it('Should reject invalid token', async () => {
        await expect(
          executeAction({
            type: 'GearboxPassiveV3Supply',
            poolAddress: '0x0000000000000000000000000000000000000000',
          })
        ).to.be.revertedWith('GS013');
      });
    });
  });

  describe('GearboxPassiveV3 Withdraw', () => {
    beforeEach(async () => {
      // Do empty deposits to initialize the fee timestamps for all pools
      for (const { poolAddress } of testCases) {
        await executeAction({
          type: 'GearboxPassiveV3Supply',
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

          // First supply to have something to withdraw
          await fundAccountWithToken(safeAddr, token, amount);
          await executeAction({
            type: 'GearboxPassiveV3Supply',
            poolAddress,
            amount,
          });

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialsdTokenBalance = await sdToken().balanceOf(safeAddr);

          await executeAction({
            type: 'GearboxPassiveV3Withdraw',
            poolAddress,
            amount,
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalsdTokenBalance = await sdToken().balanceOf(safeAddr);
          expect(finalTokenBalance).to.be.greaterThan(initialTokenBalance);
          expect(finalsdTokenBalance).to.be.lessThan(initialsdTokenBalance);
        });

        it('Should withdraw the maximum amount', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);

          // First supply to have something to withdraw
          await fundAccountWithToken(safeAddr, token, amount);
          await executeAction({
            type: 'GearboxPassiveV3Supply',
            poolAddress,
            amount,
          });

          expect(await sdToken().balanceOf(safeAddr)).to.be.greaterThan(0);
          expect(await tokenContract.balanceOf(safeAddr)).to.equal(0);

          await executeAction({
            type: 'GearboxPassiveV3Withdraw',
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
            type: 'GearboxPassiveV3Supply',
            poolAddress,
            amount,
            feeBasis: 10,
          });

          const sdTokenBalanceAfterSupply = await sdToken().balanceOf(safeAddr);

          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(safeAddr, poolAddress);
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          const withdrawTx = await executeAction({
            type: 'GearboxPassiveV3Withdraw',
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
        const strategyId: number = 42;
        const poolId: BytesLike = ethers.keccak256(GEARBOX_PASSIVE_USDC_ADDRESS).slice(0, 10);

        // First supply to have something to withdraw
        await fundAccountWithToken(safeAddr, token, amount);
        await executeAction({
          type: 'GearboxPassiveV3Supply',
          poolAddress: GEARBOX_PASSIVE_USDC_ADDRESS,
          amount,
        });

        const initialBalance = await gearboxPassiveUSDC.balanceOf(safeAddr);

        const tx = await executeAction({
          type: 'GearboxPassiveV3Withdraw',
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
        expect(txLog.balanceBefore).to.equal(initialBalance);
        expect(txLog.balanceAfter).to.be.lt(txLog.balanceBefore);
        expect(txLog.feeInTokens).to.equal(BigInt(0));
      });

      it('Should have withdraw action type', async () => {
        const actionType = await gearboxPassiveV3WithdrawContract.actionType();
        expect(actionType).to.equal(actionTypes.WITHDRAW_ACTION);
      });

      it('Should reject invalid token', async () => {
        await expect(
          executeAction({
            type: 'GearboxPassiveV3Withdraw',
            poolAddress: '0x0000000000000000000000000000000000000000',
          })
        ).to.be.revertedWith('GS013');
      });
    });
  });
});

export {};
