import { BytesLike } from 'ethers';
import { network } from 'hardhat';
import { ethers, expect, Signer } from '../..';
import { actionTypes } from '../../actions';
import { tokenConfig } from '../../constants';
import {
  AdminVault,
  FluidSupply,
  FluidWithdraw,
  IERC20,
  IERC4626,
  IFluidLending,
  Logger,
  MorphoSupply,
  MorphoWithdraw,
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

// Morpho uses the same underlying token for multiple pools, so we need a descriptive name
const getTokenNameFromAddress = (address: string): string => {
  return (
    Object.entries(tokenConfig).find(
      ([_, config]) => config.address.toLowerCase() === address.toLowerCase()
    )?.[0] ?? address
  );
};

describe('Morpho tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let loggerAddress: string;
  let logger: Logger;
  let snapshotId: string;
  let USDC: IERC20;
  let USDT: IERC20;
  let morphoSupplyContract: MorphoSupply;
  let morphoWithdrawContract: MorphoWithdraw;
  let morphoSupplyAddress: string;
  let morphoWithdrawAddress: string;
  let fxUSDC: IERC4626;
  let usualUSDC: IERC4626;
  let gauntletUSDC: IERC4626;
  // let fUSDT: IFluidLending;
  let adminVault: AdminVault;
  const MORPHO_fxUSDC_ADDRESS = tokenConfig.fxUSDC.address;
  // const FLUID_USDT_ADDRESS = tokenConfig.fUSDT.address;

  // Define test cases for each supported token
  const testCases: Array<{
    token: keyof typeof tokenConfig;
    poolAddress: string;
    mToken: () => IERC4626;
  }> = [
    {
      token: 'USDC',
      poolAddress: tokenConfig.fxUSDC.address,
      mToken: () => fxUSDC,
    },
    {
      token: 'USDC',
      poolAddress: tokenConfig.usualUSDC.address,
      mToken: () => usualUSDC,
    },
    {
      token: 'USDC',
      poolAddress: tokenConfig.gauntletUSDC.address,
      mToken: () => gauntletUSDC,
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
    morphoSupplyContract = await deploy(
      'MorphoSupply',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    morphoWithdrawContract = await deploy(
      'MorphoWithdraw',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    morphoSupplyAddress = await morphoSupplyContract.getAddress();
    morphoWithdrawAddress = await morphoWithdrawContract.getAddress();
    fxUSDC = await ethers.getContractAt('IERC4626', tokenConfig.fxUSDC.address);
    usualUSDC = await ethers.getContractAt('IERC4626', tokenConfig.usualUSDC.address);
    gauntletUSDC = await ethers.getContractAt('IERC4626', tokenConfig.gauntletUSDC.address);

    // propose and add all tokens in the testCases array
    for (const { poolAddress } of testCases) {
      log('Proposing and adding pool for', getTokenNameFromAddress(poolAddress));
      await adminVault.proposePool('Morpho', poolAddress);
      await adminVault.addPool('Morpho', poolAddress);
    }
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

  describe('Morpho Supply', () => {
    // Token-specific tests
    testCases.forEach(({ token, poolAddress, mToken }) => {
      describe(`${getTokenNameFromAddress(poolAddress)} Supply Tests`, () => {
        it('Should deposit', async () => {
          const amount = ethers.parseUnits('2000', tokenConfig.USDC.decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialMorphoBalance = await mToken().balanceOf(safeAddr);

          await executeAction({
            type: 'MorphoSupply',
            poolAddress,
            amount,
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalMorphoBalance = await mToken().balanceOf(safeAddr);

          expect(finalTokenBalance).to.equal(initialTokenBalance - amount);
          expect(finalMorphoBalance).to.be.greaterThan(initialMorphoBalance);
        });

        it('Should deposit max', async () => {
          const amount = ethers.parseUnits('2000', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          await fundAccountWithToken(safeAddr, token, amount);

          expect(await tokenContract.balanceOf(safeAddr)).to.equal(amount);

          await executeAction({
            type: 'MorphoSupply',
            poolAddress,
            amount: ethers.MaxUint256,
          });

          expect(await tokenContract.balanceOf(safeAddr)).to.equal(0);
          expect(await mToken().balanceOf(safeAddr)).to.be.greaterThan(0);
        });

        it('Should take fees on deposit', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          await fundAccountWithToken(safeAddr, token, amount);

          const feeConfig = await adminVault.feeConfig();
          const feeRecipient = feeConfig.recipient;
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          const feeRecipientTokenBalanceBefore = await tokenContract.balanceOf(feeRecipient);
          const feeRecipientMorphoBalanceBefore = await mToken().balanceOf(feeRecipient);

          // initial deposit
          const tx1 = await executeAction({
            type: 'MorphoSupply',
            poolAddress,
            amount,
            feeBasis: 10,
          });

          const morphoBalanceAfterSupply = await mToken().balanceOf(safeAddr);

          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(safeAddr, poolAddress);

          // fast forward one year
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          // second deposit
          const tx2 = await executeAction({
            type: 'MorphoSupply',
            poolAddress,
            amount: '0',
            feeBasis: 10,
          });

          const expectedFee = await calculateExpectedFee(
            (await tx1.wait()) ??
              (() => {
                throw new Error('Supply transaction failed');
              })(),
            (await tx2.wait()) ??
              (() => {
                throw new Error('Supply transaction failed');
              })(),
            10,
            morphoBalanceAfterSupply
          );

          expect(await tokenContract.balanceOf(feeRecipient)).to.equal(
            feeRecipientTokenBalanceBefore
          );
          expect(await mToken().balanceOf(feeRecipient)).to.be.greaterThan(
            feeRecipientMorphoBalanceBefore
          );
        });
      });
    });

    // General tests (unchanged)
    describe('General Supply Tests', () => {
      it('Should emit the correct log on deposit', async () => {
        const amount = ethers.parseUnits('2000', tokenConfig.USDC.decimals);
        await fundAccountWithToken(safeAddr, 'USDC', amount);
        const strategyId: number = 42;
        const poolId: BytesLike = ethers.keccak256(MORPHO_fxUSDC_ADDRESS).slice(0, 10);

        const tx = await executeAction({
          type: 'MorphoSupply',
          amount,
        });

        const logs = await decodeLoggerLog(tx);
        log('Logs:', logs);

        expect(logs).to.have.length(1);
        expect(logs[0]).to.have.property('eventId', BigInt(ACTION_LOG_IDS.BALANCE_UPDATE));

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

      it('Should initialize the last fee timestamp', async () => {
        const initialLastFeeTimestamp = await adminVault.lastFeeTimestamp(
          safeAddr,
          MORPHO_fxUSDC_ADDRESS
        );
        expect(initialLastFeeTimestamp).to.equal(BigInt(0));

        await fundAccountWithToken(safeAddr, 'USDC', 1000);

        const tx = await executeAction({
          type: 'MorphoSupply',
          amount: '1000',
        });

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
          MORPHO_fxUSDC_ADDRESS
        );
        expect(finalLastFeeTimestamp).to.equal(BigInt(block.timestamp));
      });

      it('Should have deposit action type', async () => {
        const actionType = await morphoSupplyContract.actionType();
        expect(actionType).to.equal(actionTypes.DEPOSIT_ACTION);
      });

      it('Should reject invalid token', async () => {
        await expect(
          executeAction({
            type: 'MorphoSupply',
            poolAddress: '0x0000000000000000000000000000000000000000',
            amount: '1000',
          })
        ).to.be.revertedWith('GS013');
      });
    });
  });

  describe('Morpho Withdraw', () => {
    // Token-specific tests
    testCases.forEach(({ token, poolAddress, mToken }) => {
      describe(`${getTokenNameFromAddress(poolAddress)} Withdraw Tests`, () => {
        beforeEach(async () => {
          // Do an empty deposit to initialize the fee timestamp
          await executeAction({
            type: 'MorphoSupply',
            poolAddress,
            amount: '0',
          });
        });

        it('Should withdraw', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);

          // First supply to have something to withdraw
          await fundAccountWithToken(safeAddr, token, amount);
          await executeAction({
            type: 'MorphoSupply',
            poolAddress,
            amount,
          });

          const initialTokenBalance = await tokenContract.balanceOf(safeAddr);
          const initialMorphoBalance = await mToken().balanceOf(safeAddr);

          await executeAction({
            type: 'MorphoWithdraw',
            poolAddress,
            amount,
          });

          const finalTokenBalance = await tokenContract.balanceOf(safeAddr);
          const finalMorphoBalance = await mToken().balanceOf(safeAddr);

          expect(finalTokenBalance).to.be.greaterThan(initialTokenBalance);
          expect(finalMorphoBalance).to.be.lessThan(initialMorphoBalance);
        });

        it('Should withdraw the maximum amount', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          // First supply to have something to withdraw
          await fundAccountWithToken(safeAddr, token, amount);
          await executeAction({
            type: 'MorphoSupply',
            poolAddress,
            amount,
          });

          const initialMorphoBalance = await mToken().balanceOf(safeAddr);
          expect(initialMorphoBalance).to.be.gt(0);

          await executeAction({
            type: 'MorphoWithdraw',
            poolAddress,
            amount: ethers.MaxUint256,
          });

          // Morpho leaves some dust in the vault, so we expect to have less than 1 shares worth left behind
          const minWithdraw = await mToken().convertToShares(1);
          expect(await mToken().balanceOf(safeAddr)).to.be.lessThan(minWithdraw);
          expect(await tokenContract.balanceOf(safeAddr)).to.be.greaterThan(0);
        });

        it('Should take fees on withdraw', async () => {
          const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
          await fundAccountWithToken(safeAddr, token, amount);

          const feeConfig = await adminVault.feeConfig();
          const feeRecipient = feeConfig.recipient;
          const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
          const feeRecipientTokenBalanceBefore = await tokenContract.balanceOf(feeRecipient);
          const feeRecipientMorphoBalanceBefore = await mToken().balanceOf(feeRecipient);

          const supplyTx = await executeAction({
            type: 'MorphoSupply',
            amount,
            feeBasis: 10,
          });

          const morphoBalanceAfterSupply = await mToken().balanceOf(safeAddr);

          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
            safeAddr,
            MORPHO_fxUSDC_ADDRESS
          );
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          const withdrawTx = await executeAction({
            type: 'MorphoWithdraw',
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
            morphoBalanceAfterSupply
          );
          const expectedFeeRecipientBalance = feeRecipientMorphoBalanceBefore + expectedFee;

          expect(await tokenContract.balanceOf(feeRecipient)).to.equal(
            feeRecipientTokenBalanceBefore
          );
          expect(await mToken().balanceOf(feeRecipient)).to.be.greaterThanOrEqual(
            expectedFeeRecipientBalance
          );
        });
      });
    });

    // General tests
    describe('General Withdraw Tests', () => {
      it('Should emit the correct log on withdraw', async () => {
        const token = 'USDC';
        const amount = ethers.parseUnits('100', tokenConfig[token].decimals);
        const tokenContract = await ethers.getContractAt('IERC20', tokenConfig[token].address);
        const strategyId: number = 42;
        const poolId: BytesLike = ethers.keccak256(MORPHO_fxUSDC_ADDRESS).slice(0, 10);

        // First supply to have something to withdraw
        await fundAccountWithToken(safeAddr, token, amount);
        await executeAction({
          type: 'MorphoSupply',
          amount,
        });

        const tx = await executeAction({
          type: 'MorphoWithdraw',
          amount: ethers.MaxUint256,
        });

        const logs = await decodeLoggerLog(tx);
        log('Logs:', logs);

        expect(logs).to.have.length(1);
        expect(logs[0]).to.have.property('eventId', BigInt(ACTION_LOG_IDS.BALANCE_UPDATE));

        const txLog = logs[0] as BalanceUpdateLog;
        expect(txLog).to.have.property('safeAddress', safeAddr);
        expect(txLog).to.have.property('strategyId', BigInt(strategyId));
        expect(txLog).to.have.property('poolId', poolId);
        expect(txLog).to.have.property('balanceBefore');
        expect(txLog).to.have.property('balanceAfter');
        expect(txLog).to.have.property('feeInTokens');
      });

      it('Should have withdraw action type', async () => {
        const actionType = await morphoWithdrawContract.actionType();
        expect(actionType).to.equal(actionTypes.WITHDRAW_ACTION);
      });

      it('Should reject invalid token', async () => {
        await expect(
          executeAction({
            type: 'MorphoWithdraw',
            poolAddress: '0x0000000000000000000000000000000000000000',
            amount: '1',
          })
        ).to.be.revertedWith('GS013');
      });
    });
  });
});

export {};
