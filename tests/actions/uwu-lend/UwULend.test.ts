import { network } from 'hardhat';
import { ethers, expect, Signer } from '../..';
import { actionTypes } from '../../../tests/actions';
import { tokenConfig, UWU_LEND_POOL } from '../../../tests/constants';
import {
  AdminVault,
  IERC20,
  ILendingPool,
  Logger,
  UwULendSupply,
  UwULendWithdraw,
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
import { fundAccountWithToken, getDAI, getUSDT } from '../../utils-stable';

describe('UwU Lend tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let loggerAddress: string;
  let logger: Logger;
  let snapshotId: string;
  let USDT: IERC20;
  let DAI: IERC20;
  let uwuSupplyContract: UwULendSupply;
  let uwuWithdrawContract: UwULendWithdraw;
  let uwuSupplyAddress: string;
  let uwuWithdrawAddress: string;
  let uwuPool: ILendingPool;
  let adminVault: AdminVault;

  // Run tests for each supported token
  const testCases: Array<{
    token: keyof typeof tokenConfig;
    uToken: string;
  }> = [
    {
      token: 'USDT',
      uToken: tokenConfig.uUSDT.address,
    },
    {
      token: 'DAI',
      uToken: tokenConfig.uDAI.address,
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
    USDT = await getUSDT();
    DAI = await getDAI();

    // Initialize UwULendSupply and UwULendWithdraw actions
    uwuSupplyContract = await deploy(
      'UwULendSupply',
      signer,
      await adminVault.getAddress(),
      loggerAddress,
      UWU_LEND_POOL
    );
    uwuWithdrawContract = await deploy(
      'UwULendWithdraw',
      signer,
      await adminVault.getAddress(),
      loggerAddress,
      UWU_LEND_POOL
    );
    uwuSupplyAddress = await uwuSupplyContract.getAddress();
    uwuWithdrawAddress = await uwuWithdrawContract.getAddress();
    uwuPool = await ethers.getContractAt('ILendingPool', UWU_LEND_POOL);

    // grant the uToken contracts the POOL_ROLE and add actions
    await adminVault.proposeAction(getBytes4(uwuSupplyAddress), uwuSupplyAddress);
    await adminVault.proposeAction(getBytes4(uwuWithdrawAddress), uwuWithdrawAddress);
    await adminVault.addAction(getBytes4(uwuSupplyAddress), uwuSupplyAddress);
    await adminVault.addAction(getBytes4(uwuWithdrawAddress), uwuWithdrawAddress);

    for (const { uToken } of testCases) {
      await adminVault.proposePool('UwULend', uToken);
      await adminVault.addPool('UwULend', uToken);
    }
  });

  beforeEach(async () => {
    log('Taking local snapshot');
    snapshotId = await network.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    log('Reverting to local snapshot');
    await network.provider.send('evm_revert', [snapshotId]);
  });

  describe('UwU Supply', () => {
    testCases.forEach(({ token, uToken }) => {
      describe(`Testing ${token}`, () => {
        it('Should deposit', async () => {
          const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          const uTokenContract = await ethers.getContractAt('IERC20', uToken);
          await fundAccountWithToken(safeAddr, token, amount);

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialUwUBalance = await uTokenContract.balanceOf(safeAddr);

          await executeAction({
            type: 'UwULendSupply',
            assetId: getBytes4(uToken),
            amount,
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalUwUBalance = await uTokenContract.balanceOf(safeAddr);

          expect(finalTokenBalance).to.be.lt(initialTokenBalance);
          expect(finalUwUBalance).to.be.gt(initialUwUBalance);
        });

        it('Should deposit max', async () => {
          const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          await executeAction({
            type: 'UwULendSupply',
            assetId: getBytes4(uToken),
            amount: ethers.MaxUint256.toString(),
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          expect(finalTokenBalance).to.equal(0n);
        });

        it('Should take fees on deposit', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          const uTokenContract = await ethers.getContractAt('IERC20', uToken);
          await fundAccountWithToken(safeAddr, token, amount);

          const feeConfig = await adminVault.feeConfig();
          const feeRecipient = feeConfig.recipient;
          const feeRecipientTokenBalanceBefore = await tokenContract.balanceOf(feeRecipient);
          const feeRecipientuTokenBalanceBefore = await uTokenContract.balanceOf(feeRecipient);

          // Do an initial deposit
          const firstTx = await executeAction({
            type: 'UwULendSupply',
            assetId: getBytes4(uToken),
            amount,
            feeBasis: 10,
          });

          const uTokenBalanceAfterFirstTx = await uTokenContract.balanceOf(safeAddr);

          // Time travel 1 year
          const protocolId = BigInt(
            ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['string'], ['UwULend']))
          );
          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
            safeAddr,
            protocolId,
            uToken
          );
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          // Do another deposit to trigger fees
          const secondTx = await executeAction({
            type: 'UwULendSupply',
            assetId: getBytes4(uToken),
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
            uTokenBalanceAfterFirstTx
          );
          const expectedFeeRecipientBalance = feeRecipientuTokenBalanceBefore + expectedFee;

          expect(await tokenContract.balanceOf(feeRecipient)).to.equal(
            feeRecipientTokenBalanceBefore
          );
          expect(await uTokenContract.balanceOf(feeRecipient)).to.be.greaterThanOrEqual(
            expectedFeeRecipientBalance
          );
        });
      });
    });

    describe('General tests', () => {
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

        const txLog = logs[0] as BalanceUpdateLog;
        expect(txLog).to.have.property('safeAddress', safeAddr);
        expect(txLog).to.have.property('strategyId', BigInt(strategyId));
        expect(txLog).to.have.property('poolId', getBytes4(tokenConfig.uUSDT.address));
        expect(txLog).to.have.property('balanceBefore', 0n);
        expect(txLog).to.have.property('balanceAfter');
        expect(txLog).to.have.property('feeInTokens', 0n);
        expect(txLog.balanceAfter).to.be.a('bigint');
        expect(txLog.balanceAfter).to.not.equal(BigInt(0));
        // With aave we earn extra tokens over time, so slow tests mean we can't check exact amounts
        // We check 1 wei less because of edges cases in the aave protocol
        expect(txLog.balanceAfter).to.be.greaterThanOrEqual(amount - 1n);
      });

      it('Should initialize the last fee timestamp', async () => {
        const protocolId = BigInt(
          ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['string'], ['UwULend']))
        );
        const lastFeeTimestamp = await adminVault.lastFeeTimestamp(
          safeAddr,
          protocolId,
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
          protocolId,
          tokenConfig.uUSDT.address
        );
        expect(lastFeeTimestampAfter).to.not.equal(0n);
      });

      it('Should have deposit action type', async () => {
        const actionType = await uwuSupplyContract.actionType();
        expect(actionType).to.equal(actionTypes.DEPOSIT_ACTION);
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
  });

  describe('UwU Withdraw', () => {
    beforeEach(async () => {
      // Do empty deposits to initialize the fee timestamps for all pools
      for (const { uToken } of testCases) {
        await executeAction({
          type: 'UwULendSupply',
          assetId: getBytes4(uToken),
          amount: '0',
        });
      }
    });

    testCases.forEach(({ token, uToken }) => {
      describe(`Testing ${token}`, () => {
        it('Should withdraw', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          const uTokenContract = await ethers.getContractAt('IERC20', uToken);

          // Supply first
          await fundAccountWithToken(safeAddr, token, amount);
          await executeAction({
            type: 'UwULendSupply',
            assetId: getBytes4(uToken),
            amount,
          });

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialUwUBalance = await uTokenContract.balanceOf(safeAddr);

          await executeAction({
            type: 'UwULendWithdraw',
            assetId: getBytes4(uToken),
            amount,
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalUwUBalance = await uTokenContract.balanceOf(safeAddr);

          expect(finalTokenBalance).to.be.gt(initialTokenBalance);
          expect(finalUwUBalance).to.be.lt(initialUwUBalance);
        });

        it('Should withdraw the maximum amount', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          const uTokenContract = await ethers.getContractAt('IERC20', uToken);

          // Supply first
          await fundAccountWithToken(safeAddr, token, amount);
          await executeAction({
            type: 'UwULendSupply',
            assetId: getBytes4(uToken),
            amount,
          });

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialUwUBalance = await uTokenContract.balanceOf(safeAddr);
          expect(initialUwUBalance).to.be.gt(0);

          await executeAction({
            type: 'UwULendWithdraw',
            assetId: getBytes4(uToken),
            amount: ethers.MaxUint256,
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalUwUBalance = await uTokenContract.balanceOf(safeAddr);

          expect(finalTokenBalance).to.be.gt(initialTokenBalance);
          expect(finalUwUBalance).to.equal(0);
        });

        it('Should take fees on withdraw', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          const uTokenContract = await ethers.getContractAt('IERC20', uToken);

          const feeConfig = await adminVault.feeConfig();
          const feeRecipient = feeConfig.recipient;
          const feeRecipientTokenBalanceBefore = await tokenContract.balanceOf(feeRecipient);
          const feeRecipientuTokenBalanceBefore = await uTokenContract.balanceOf(feeRecipient);

          // Supply first
          await fundAccountWithToken(safeAddr, token, amount);
          const supplyTx = await executeAction({
            type: 'UwULendSupply',
            assetId: getBytes4(uToken),
            amount,
            feeBasis: 10,
          });

          const uTokenBalanceAfterSupply = await uTokenContract.balanceOf(safeAddr);

          // Time travel 1 year
          const protocolId = BigInt(
            ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['string'], ['UwULend']))
          );
          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
            safeAddr,
            protocolId,
            uToken
          );
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          const withdrawTx = await executeAction({
            type: 'UwULendWithdraw',
            assetId: getBytes4(uToken),
            amount: '1',
            feeBasis: 10,
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
            uTokenBalanceAfterSupply
          );
          const expectedFeeRecipientBalance = feeRecipientuTokenBalanceBefore + expectedFee;

          expect(await tokenContract.balanceOf(feeRecipient)).to.equal(
            feeRecipientTokenBalanceBefore
          );
          expect(await uTokenContract.balanceOf(feeRecipient)).to.be.greaterThanOrEqual(
            expectedFeeRecipientBalance
          );
        });
      });
    });

    describe('General tests', () => {
      it('Should emit the correct log on withdraw', async () => {
        const token = 'uUSDT';
        const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
        await fundAccountWithToken(safeAddr, token, amount);
        const strategyId: number = 42;

        const tx = await executeAction({
          type: 'UwULendWithdraw',
          assetId: getBytes4(tokenConfig[token].address),
          amount: ethers.MaxUint256.toString(),
        });

        const logs = await decodeLoggerLog(tx);
        log('Logs:', logs);

        expect(logs).to.have.length(1);
        expect(logs[0]).to.have.property('eventId', BigInt(ACTION_LOG_IDS.BALANCE_UPDATE));

        const txLog = logs[0] as BalanceUpdateLog;
        expect(txLog).to.have.property('safeAddress', safeAddr);
        expect(txLog).to.have.property('strategyId', BigInt(strategyId));
        expect(txLog).to.have.property('poolId', getBytes4(tokenConfig[token].address));
        expect(txLog).to.have.property('balanceBefore');
        expect(txLog).to.have.property('balanceAfter', 0n);
        expect(txLog).to.have.property('feeInTokens', 0n);
        expect(txLog.balanceAfter).to.be.a('bigint');
        expect(txLog.balanceBefore).to.be.a('bigint');
        // With uwu we earn extra tokens over time, so slow tests mean we can't check exact amounts
        expect(txLog.balanceBefore).to.be.greaterThanOrEqual(amount);
      });

      it('Should have withdraw action type', async () => {
        const actionType = await uwuWithdrawContract.actionType();
        expect(actionType).to.equal(actionTypes.WITHDRAW_ACTION);
      });

      it('Should reject invalid token', async () => {
        await expect(
          executeAction({
            type: 'UwULendWithdraw',
            assetId: '0x00000000',
            amount: '1',
          })
        ).to.be.revertedWith('GS013');
      });
    });
  });
});

export {};
