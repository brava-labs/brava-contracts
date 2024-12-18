import { network } from 'hardhat';
import { ethers, expect, Signer } from '../..';
import { ACROSS_HUB, tokenConfig } from '../../../tests/constants';
import {
  AcrossSupply,
  AcrossWithdraw,
  AdminVault,
  HubPoolInterface,
  IERC20,
  Logger,
} from '../../../typechain-types';
import { actionTypes } from '../../actions';
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
import { fundAccountWithToken, getDAI, getUSDC, getUSDT } from '../../utils-stable';

describe('Across tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let loggerAddress: string;
  let logger: Logger;
  let snapshotId: string;
  let USDC: IERC20;
  let USDT: IERC20;
  let DAI: IERC20;
  let hubPool: HubPoolInterface;
  let acrossSupplyContract: AcrossSupply;
  let acrossWithdrawContract: AcrossWithdraw;
  let acrossSupplyAddress: string;
  let acrossWithdrawAddress: string;
  let adminVault: AdminVault;

  // Run tests for each supported token
  const testCases: Array<{
    token: keyof typeof tokenConfig;
    lpToken: keyof typeof tokenConfig;
  }> = [
    {
      token: 'USDC',
      lpToken: 'across_lpUSDC',
    },
    {
      token: 'USDT',
      lpToken: 'across_lpUSDT',
    },
    {
      token: 'DAI',
      lpToken: 'across_lpDAI',
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
    hubPool = await ethers.getContractAt('HubPoolInterface', ACROSS_HUB);

    // Initialize AcrossSupply and AcrossWithdraw actions
    acrossSupplyContract = await deploy(
      'AcrossSupply',
      signer,
      await adminVault.getAddress(),
      loggerAddress,
      ACROSS_HUB
    );
    acrossWithdrawContract = await deploy(
      'AcrossWithdraw',
      signer,
      await adminVault.getAddress(),
      loggerAddress,
      ACROSS_HUB
    );
    acrossSupplyAddress = await acrossSupplyContract.getAddress();
    acrossWithdrawAddress = await acrossWithdrawContract.getAddress();

    // grant the aToken contracts the POOL_ROLE and add actions
    await adminVault.proposeAction(getBytes4(acrossSupplyAddress), acrossSupplyAddress);
    await adminVault.proposeAction(getBytes4(acrossWithdrawAddress), acrossWithdrawAddress);
    await adminVault.addAction(getBytes4(acrossSupplyAddress), acrossSupplyAddress);
    await adminVault.addAction(getBytes4(acrossWithdrawAddress), acrossWithdrawAddress);

    for (const { token } of testCases) {
      await adminVault.proposePool('Across', tokenConfig[token].address);
      await adminVault.addPool('Across', tokenConfig[token].address);
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
  describe('Across Supply', () => {
    testCases.forEach(({ token, lpToken }) => {
      describe(`Testing ${token}`, () => {
        it('Should deposit', async () => {
          const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          const lpTokenContract = await ethers.getContractAt(
            'IERC20',
            tokenConfig[lpToken].address
          );
          await fundAccountWithToken(safeAddr, token, amount);

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialAcrossBalance = await lpTokenContract.balanceOf(safeAddr);

          await executeAction({
            type: 'AcrossSupply',
            poolAddress: tokenConfig[token].address,
            amount,
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalAcrossBalance = await lpTokenContract.balanceOf(safeAddr);

          expect(finalTokenBalance).to.be.lt(initialTokenBalance);
          expect(finalAcrossBalance).to.be.gt(initialAcrossBalance);
        });

        it('Should deposit max', async () => {
          const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          const lpTokenContract = await ethers.getContractAt(
            'IERC20',
            tokenConfig[lpToken].address
          );
          await fundAccountWithToken(safeAddr, token, amount);

          await executeAction({
            type: 'AcrossSupply',
            poolAddress: tokenConfig[token].address,
            amount: ethers.MaxUint256.toString(),
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalAcrossBalance = await lpTokenContract.balanceOf(safeAddr);
          expect(finalTokenBalance).to.equal(0n);
          expect(finalAcrossBalance).to.be.gt(0n);
        });

        it('Should take fees on deposit', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          const lpTokenContract = await ethers.getContractAt(
            'IERC20',
            tokenConfig[lpToken].address
          );
          await fundAccountWithToken(safeAddr, token, amount);

          const feeConfig = await adminVault.feeConfig();
          const feeRecipient = feeConfig.recipient;
          const feeRecipientTokenBalanceBefore = await tokenContract.balanceOf(feeRecipient);
          const feeRecipientLpTokenBalanceBefore = await lpTokenContract.balanceOf(feeRecipient);

          // Do an initial deposit
          const firstTx = await executeAction({
            type: 'AcrossSupply',
            poolAddress: tokenConfig[token].address,
            amount,
            feeBasis: 10,
          });

          const lpTokenBalanceAfterFirstTx = await lpTokenContract.balanceOf(safeAddr);

          // Time travel 1 year
          const protocolId = BigInt(
            ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['string'], ['Across']))
          );
          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
            safeAddr,
            protocolId,
            tokenConfig[token].address
          );
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          // Do another deposit to trigger fees
          const secondTx = await executeAction({
            type: 'AcrossSupply',
            poolAddress: tokenConfig[token].address,
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
            lpTokenBalanceAfterFirstTx
          );
          const expectedFeeRecipientBalance = feeRecipientLpTokenBalanceBefore + expectedFee;

          // With Aave we earn extra tokens over time, so the fee recipient should have more than the expected fee
          expect(await tokenContract.balanceOf(feeRecipient)).to.equal(
            feeRecipientTokenBalanceBefore
          );
          expect(await lpTokenContract.balanceOf(feeRecipient)).to.be.greaterThanOrEqual(
            expectedFeeRecipientBalance
          );
        });
      });
    });

    describe('General tests', () => {
      it('Should emit the correct log on deposit', async () => {
        const token = 'USDC';
        const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
        await fundAccountWithToken(safeAddr, token, amount);
        const strategyId: number = 42;

        const tx = await executeAction({
          type: 'AcrossSupply',
          poolAddress: tokenConfig[token].address,
          amount: amount.toString(),
        });

        const logs = await decodeLoggerLog(tx);
        log('Logs:', logs);

        expect(logs).to.have.length(1);
        expect(logs[0]).to.have.property('eventId', BigInt(ACTION_LOG_IDS.BALANCE_UPDATE));

        const txLog = logs[0] as BalanceUpdateLog;
        expect(txLog).to.have.property('safeAddress', safeAddr);
        expect(txLog).to.have.property('strategyId', BigInt(strategyId));
        expect(txLog).to.have.property('poolId', getBytes4(tokenConfig[token].address));
        expect(txLog).to.have.property('balanceBefore', 0n);
        expect(txLog).to.have.property('balanceAfter');
        expect(txLog).to.have.property('feeInTokens', 0n);
        expect(txLog.balanceAfter).to.be.a('bigint');
        expect(txLog.balanceAfter).to.not.equal(BigInt(0));
      });

      it('Should initialize the last fee timestamp', async () => {
        const token = 'USDC';
        const protocolId = BigInt(
          ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['string'], ['Across']))
        );
        const lastFeeTimestamp = await adminVault.lastFeeTimestamp(
          safeAddr,
          protocolId,
          tokenConfig[token].address
        );
        expect(lastFeeTimestamp).to.equal(0n);

        await executeAction({
          type: 'AcrossSupply',
          poolAddress: tokenConfig[token].address,
          amount: '0',
        });

        const lastFeeTimestampAfter = await adminVault.lastFeeTimestamp(
          safeAddr,
          protocolId,
          tokenConfig[token].address
        );
        expect(lastFeeTimestampAfter).to.not.equal(0n);
      });

      it('Should have deposit action type', async () => {
        const actionType = await acrossSupplyContract.actionType();
        expect(actionType).to.equal(actionTypes.DEPOSIT_ACTION);
      });

      it('Should reject invalid token', async () => {
        await expect(
          executeAction({
            type: 'AcrossSupply',
            poolAddress: '0x00000000',
            amount: '1',
          })
        ).to.be.revertedWith('GS013');
      });
    });
  });
  describe('Across Withdraw', () => {
    beforeEach(async () => {
      // Do empty deposits to initialize the fee timestamps for all pools
      for (const { token, lpToken } of testCases) {
        await executeAction({
          type: 'AcrossSupply',
          poolAddress: tokenConfig[token].address,
          amount: '0',
        });
      }
    });

    testCases.forEach(({ token, lpToken }) => {
      describe(`Testing ${token}`, () => {
        it('Should withdraw', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          const lpTokenContract = await ethers.getContractAt(
            'IERC20',
            tokenConfig[lpToken].address
          );

          // Supply first
          await fundAccountWithToken(safeAddr, token, amount);
          await executeAction({
            type: 'AcrossSupply',
            poolAddress: tokenConfig[token].address,
            amount,
          });

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialAcrossBalance = await lpTokenContract.balanceOf(safeAddr);

          await executeAction({
            type: 'AcrossWithdraw',
            poolAddress: tokenConfig[token].address,
            amount,
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalAcrossBalance = await lpTokenContract.balanceOf(safeAddr);

          expect(finalTokenBalance).to.be.gt(initialTokenBalance);
          expect(finalAcrossBalance).to.be.lt(initialAcrossBalance);
        });

        it('Should withdraw the maximum amount', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          const lpTokenContract = await ethers.getContractAt(
            'IERC20',
            tokenConfig[lpToken].address
          );

          // Supply first
          await fundAccountWithToken(safeAddr, token, amount);
          await executeAction({
            type: 'AcrossSupply',
            poolAddress: tokenConfig[token].address,
            amount,
          });

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialAcrossBalance = await lpTokenContract.balanceOf(safeAddr);
          expect(initialAcrossBalance).to.be.gt(0);

          await executeAction({
            type: 'AcrossWithdraw',
            poolAddress: tokenConfig[token].address,
            amount: ethers.MaxUint256,
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalAcrossBalance = await lpTokenContract.balanceOf(safeAddr);

          expect(finalTokenBalance).to.be.gt(initialTokenBalance);
          expect(finalAcrossBalance).to.equal(0);
        });

        it('Should take fees on withdraw', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          const lpTokenContract = await ethers.getContractAt(
            'IERC20',
            tokenConfig[lpToken].address
          );

          const feeConfig = await adminVault.feeConfig();
          const feeRecipient = feeConfig.recipient;
          const feeRecipientTokenBalanceBefore = await tokenContract.balanceOf(feeRecipient);
          const feeRecipientLpTokenBalanceBefore = await lpTokenContract.balanceOf(feeRecipient);

          // Supply first
          await fundAccountWithToken(safeAddr, token, amount);
          const supplyTx = await executeAction({
            type: 'AcrossSupply',
            poolAddress: tokenConfig[token].address,
            amount,
            feeBasis: 10,
          });

          const lpTokenBalanceAfterSupply = await lpTokenContract.balanceOf(safeAddr);

          // Time travel 1 year
          const protocolId = BigInt(
            ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['string'], ['Across']))
          );
          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
            safeAddr,
            protocolId,
            tokenConfig[token].address
          );
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          const withdrawTx = await executeAction({
            type: 'AcrossWithdraw',
            poolAddress: tokenConfig[token].address,
            amount: '10',
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
            lpTokenBalanceAfterSupply
          );
          const expectedFeeRecipientBalance = feeRecipientLpTokenBalanceBefore + expectedFee;

          expect(await tokenContract.balanceOf(feeRecipient)).to.equal(
            feeRecipientTokenBalanceBefore
          );
          expect(await lpTokenContract.balanceOf(feeRecipient)).to.be.greaterThanOrEqual(
            expectedFeeRecipientBalance
          );
        });
      });
    });

    describe('General tests', () => {
      it('Should have withdraw action type', async () => {
        const actionType = await acrossWithdrawContract.actionType();
        expect(actionType).to.equal(actionTypes.WITHDRAW_ACTION);
      });

      it('Should reject invalid token', async () => {
        await expect(
          executeAction({
            type: 'AcrossWithdraw',
            poolAddress: '0x00000000',
            amount: '1',
          })
        ).to.be.revertedWith('GS013');
      });
    });
  });
});
