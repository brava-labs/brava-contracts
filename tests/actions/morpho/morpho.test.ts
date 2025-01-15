import { BytesLike } from 'ethers';
import { network } from 'hardhat';
import { ethers, expect, Signer } from '../..';
import { actionTypes } from '../../actions';
import { tokenConfig } from '../../constants';
import {
  AdminVault,
  IERC20,
  IERC4626,
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
  let re7USDT: IERC4626;
  let reUSDC: IERC4626;
  let steakUSDT: IERC4626;
  let steakUSDC: IERC4626;
  let gtUSDC: IERC4626;
  let gtUSDT: IERC4626;
  // let fUSDT: IFluidLending;
  let adminVault: AdminVault;
  const protocolId = BigInt(
    ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['string'], ['Morpho']))
  );

  // Define test cases for each supported token
  const testCases: Array<{
    token: keyof typeof tokenConfig;
    poolAddress: string;
    mToken: () => IERC4626;
  }> = [
    {
      token: 'USDC',
      poolAddress: tokenConfig.MORPHO_V1_fxUSDC.address,
      mToken: () => fxUSDC,
    },
    {
      token: 'USDC',
      poolAddress: tokenConfig.MORPHO_V1_USUALUSDC.address,
      mToken: () => usualUSDC,
    },
    {
      token: 'USDC',
      poolAddress: tokenConfig.MORPHO_V1_gtUSDCcore.address,
      mToken: () => gauntletUSDC,
    },
    {
      token: 'USDT',
      poolAddress: tokenConfig.MORPHO_V1_re7USDT.address,
      mToken: () => re7USDT,
    },
    {
      token: 'USDC',
      poolAddress: tokenConfig.MORPHO_V1_reUSDC.address,
      mToken: () => reUSDC,
    },
    {
      token: 'USDT',
      poolAddress: tokenConfig.MORPHO_V1_steakUSDT.address,
      mToken: () => steakUSDT,
    },
    {
      token: 'USDC',
      poolAddress: tokenConfig.MORPHO_V1_steakUSDC.address,
      mToken: () => steakUSDC,
    },
    {
      token: 'USDC',
      poolAddress: tokenConfig.MORPHO_V1_gtUSDC.address,
      mToken: () => gtUSDC,
    },
    {
      token: 'USDT',
      poolAddress: tokenConfig.MORPHO_V1_gtUSDT.address,
      mToken: () => gtUSDT,
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
    fxUSDC = await ethers.getContractAt('IERC4626', tokenConfig.MORPHO_V1_fxUSDC.address);
    usualUSDC = await ethers.getContractAt('IERC4626', tokenConfig.MORPHO_V1_USUALUSDC.address);
    gauntletUSDC = await ethers.getContractAt('IERC4626', tokenConfig.MORPHO_V1_gtUSDCcore.address);
    re7USDT = await ethers.getContractAt('IERC4626', tokenConfig.MORPHO_V1_re7USDT.address);
    reUSDC = await ethers.getContractAt('IERC4626', tokenConfig.MORPHO_V1_reUSDC.address);
    steakUSDT = await ethers.getContractAt('IERC4626', tokenConfig.MORPHO_V1_steakUSDT.address);
    steakUSDC = await ethers.getContractAt('IERC4626', tokenConfig.MORPHO_V1_steakUSDC.address);
    gtUSDC = await ethers.getContractAt('IERC4626', tokenConfig.MORPHO_V1_gtUSDC.address);
    gtUSDT = await ethers.getContractAt('IERC4626', tokenConfig.MORPHO_V1_gtUSDT.address);

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

          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
            safeAddr,
            poolAddress
          );

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
        const poolId: BytesLike = ethers.keccak256(tokenConfig.MORPHO_V1_fxUSDC.address).slice(0, 10);

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
          tokenConfig.MORPHO_V1_fxUSDC.address
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
          tokenConfig.MORPHO_V1_fxUSDC.address
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
            poolAddress,
            amount,
            feeBasis: 10,
          });

          const morphoBalanceAfterSupply = await mToken().balanceOf(safeAddr);

          const initialFeeTimestamp = await adminVault.lastFeeTimestamp(
            safeAddr,
            poolAddress
          );
          const finalFeeTimestamp = initialFeeTimestamp + BigInt(60 * 60 * 24 * 365);
          await network.provider.send('evm_setNextBlockTimestamp', [finalFeeTimestamp.toString()]);

          const withdrawTx = await executeAction({
            type: 'MorphoWithdraw',
            poolAddress,
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
        const poolId: BytesLike = ethers.keccak256(tokenConfig.MORPHO_V1_fxUSDC.address).slice(0, 10);

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

      it('Should not confuse underlying and share tokens', async () => {
        const pool = await ethers.getContractAt('IERC4626', tokenConfig.MORPHO_V1_fxUSDC.address);
        
        // Fund with excess underlying tokens (1000 USDC)
        const largeAmount = ethers.parseUnits('1000', tokenConfig.USDC.decimals);
        const smallDepositAmount = ethers.parseUnits('100', tokenConfig.USDC.decimals);
        await fundAccountWithToken(safeAddr, 'USDC', largeAmount);
        
        const initialUnderlyingBalance = await USDC.balanceOf(safeAddr);
        expect(initialUnderlyingBalance).to.equal(largeAmount);

        // Deposit smaller amount (100 USDC)
        await executeAction({
          type: 'MorphoSupply',
          poolAddress: tokenConfig.MORPHO_V1_fxUSDC.address,
          amount: smallDepositAmount,
        });

        // Verify we still have 900 USDC
        const remainingUnderlying = await USDC.balanceOf(safeAddr);
        expect(remainingUnderlying).to.equal(largeAmount - smallDepositAmount);

        // Get share balance - should represent 100 USDC worth
        const sharesReceived = await pool.balanceOf(safeAddr);

        // Try to withdraw only 10 USDC worth
        const smallWithdrawAmount = ethers.parseUnits('10', tokenConfig.USDC.decimals);
        await executeAction({
          type: 'MorphoWithdraw',
          poolAddress: tokenConfig.MORPHO_V1_fxUSDC.address,
          amount: smallWithdrawAmount,
        });

        // Verify balances
        const finalShares = await pool.balanceOf(safeAddr);
        const finalUnderlying = await USDC.balanceOf(safeAddr);
        
        // Should have ~90 worth of shares left (minus any fees/slippage)
        const expectedSharesBurned = await pool.convertToShares(smallWithdrawAmount);
        expect(finalShares).to.be.closeTo(
          sharesReceived - expectedSharesBurned,
          ethers.parseUnits('1', tokenConfig.USDC.decimals)  // Much smaller tolerance since we're using exact conversion
        );
        
        // Should have ~910 USDC (900 + 10 withdrawn)
        expect(finalUnderlying).to.be.closeTo(
          remainingUnderlying + smallWithdrawAmount,
          ethers.parseUnits('0.1', tokenConfig.USDC.decimals)
        );
      });
    });
  });
});

export {};
