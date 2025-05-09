import { BigNumberish } from 'ethers';
import { network } from 'hardhat';
import { ethers, expect, Signer } from '../..';
import { Curve3PoolSwap, IERC20Metadata } from '../../../typechain-types';
import { actionTypes } from '../../actions';
import { CURVE_3POOL_ADDRESS, CURVE_3POOL_INDICES, tokenConfig } from '../../constants';
import { ACTION_LOG_IDS, Curve3PoolSwapLog } from '../../logs';
import { Curve3PoolSwapParams } from '../../params';
import { decodeLoggerLog, deploy, executeAction, getBaseSetup, getBytes4, log } from '../../utils';
import { fundAccountWithToken, getTokenContract } from '../../utils-stable';

interface SwapParams {
  fromToken: number;
  toToken: number;
  amountIn: BigNumberish;
  minAmountOut: BigNumberish;
}

describe('Curve3PoolSwap tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let curve3PoolSwap: Curve3PoolSwap;
  let USDC: IERC20Metadata, USDT: IERC20Metadata, DAI: IERC20Metadata;
  let snapshotId: string;

  async function testSwap(
    fromToken: 'USDC' | 'USDT' | 'DAI',
    toToken: 'USDC' | 'USDT' | 'DAI',
    fundAmount: number
  ) {
    await fundAccountWithToken(safeAddr, fromToken, fundAmount);

    const FromToken = eval(fromToken);
    const ToToken = eval(toToken);
    const initialFromBalance = await FromToken.balanceOf(safeAddr);
    const initialToBalance = await ToToken.balanceOf(safeAddr);

    const swapAmount = ethers.parseUnits(fundAmount.toString(), tokenConfig[fromToken].decimals);

    await executeAction({
      type: 'Curve3PoolSwap',
      tokenIn: fromToken,
      tokenOut: toToken,
      amount: swapAmount,
    });

    // Check balances after swap
    const finalFromBalance = await FromToken.balanceOf(safeAddr);
    const finalToBalance = await ToToken.balanceOf(safeAddr);

    // Log balances
    log(`initial${fromToken}Balance`, initialFromBalance);
    log(`final${fromToken}Balance`, finalFromBalance);
    log(`initial${toToken}Balance`, initialToBalance);
    log(`final${toToken}Balance`, finalToBalance);
    log('Expected Swap Amount', swapAmount);

    expect(finalFromBalance).to.be.equal(initialFromBalance - swapAmount);
    expect(finalToBalance).to.be.gt(
      ethers.parseUnits((fundAmount * 0.99).toString(), tokenConfig[toToken].decimals)
    );
  }

  before(async () => {
    // Deploy base setup
    [signer] = await ethers.getSigners();
    const baseSetup = await getBaseSetup();
    if (!baseSetup) {
      throw new Error('Base setup not deployed');
    }
    safeAddr = await baseSetup.safe.getAddress();
    const adminVault = await baseSetup.adminVault;
    // Deploy contracts specific to these tests
    curve3PoolSwap = await deploy(
      'Curve3PoolSwap',
      signer,
      await adminVault.getAddress(),
      await baseSetup.logger.getAddress(),
      CURVE_3POOL_ADDRESS
    );
    const tokens = await getTokenContract(['USDC', 'USDT', 'DAI']);
    USDC = tokens.USDC as IERC20Metadata;
    USDT = tokens.USDT as IERC20Metadata;
    DAI = tokens.DAI as IERC20Metadata;

    const poolAddress = await curve3PoolSwap.getAddress();

    await adminVault.proposeAction(getBytes4(poolAddress), poolAddress);
    await adminVault.addAction(getBytes4(poolAddress), poolAddress);

    // Take local snapshot before running tests
    log('Taking local snapshot');
    snapshotId = await network.provider.send('evm_snapshot');
  });

  beforeEach(async () => {});

  afterEach(async () => {
    // Revert local snapshot after each test
    log('Reverting to local snapshot', snapshotId);
    await network.provider.send('evm_revert', [snapshotId]);

    // IMPORTANT: take a new snapshot, they can't be reused!
    snapshotId = await network.provider.send('evm_snapshot');
  });

  describe('Basic swaps', () => {
    it('should have zero initial balances', async () => {
      const usdcBalance = await USDC.balanceOf(safeAddr);
      const usdtBalance = await USDT.balanceOf(safeAddr);
      const daiBalance = await DAI.balanceOf(safeAddr);

      log('USDC balance', usdcBalance);
      log('USDT balance', usdtBalance);
      log('DAI balance', daiBalance);

      expect(usdcBalance).to.equal(0);
      expect(usdtBalance).to.equal(0);
      expect(daiBalance).to.equal(0);
    });
    it('should swap USDC to USDT', async () => {
      await testSwap('USDC', 'USDT', 10);
    });

    it('should swap USDC to DAI', async () => {
      await testSwap('USDC', 'DAI', 10);
    });
    it('should swap USDT to USDC', async () => {
      await testSwap('USDT', 'USDC', 10);
    });
    it('should swap USDT to DAI', async () => {
      await testSwap('USDT', 'DAI', 10);
    });
    it('should swap DAI to USDC', async () => {
      await testSwap('DAI', 'USDC', 10);
    });
    it('should swap DAI to USDT', async () => {
      await testSwap('DAI', 'USDT', 10);
    });
  });
  describe('Check constants', () => {
    it('should check the curve3Pool tokens match our expected tokens', async () => {
      const curve3PoolInterface = new ethers.Interface([
        'function coins(uint256) view returns (address)',
      ]);

      const curve3Pool = new ethers.Contract(
        CURVE_3POOL_ADDRESS,
        curve3PoolInterface,
        ethers.provider
      );
      const tokenAddress = await curve3Pool.coins(CURVE_3POOL_INDICES.DAI);
      expect(tokenAddress.toLowerCase()).to.equal(tokenConfig.DAI.address.toLowerCase());
      const tokenAddress2 = await curve3Pool.coins(CURVE_3POOL_INDICES.USDT);
      expect(tokenAddress2.toLowerCase()).to.equal(tokenConfig.USDT.address.toLowerCase());
      const tokenAddress3 = await curve3Pool.coins(CURVE_3POOL_INDICES.USDC);
      expect(tokenAddress3.toLowerCase()).to.equal(tokenConfig.USDC.address.toLowerCase());
    });
    it('should check we have the correct token config', async () => {
      // check the token contract symbol and decimals
      expect(await USDC.symbol()).to.equal('USDC');
      expect(await USDC.decimals()).to.equal(tokenConfig.USDC.decimals);
      expect(await USDT.symbol()).to.equal('USDT');
      expect(await USDT.decimals()).to.equal(tokenConfig.USDT.decimals);
      expect(await DAI.symbol()).to.equal('DAI');
      expect(await DAI.decimals()).to.equal(tokenConfig.DAI.decimals);
    });
    it('should emit the correct log', async () => {
      await fundAccountWithToken(safeAddr, 'DAI', 1000);

      const swapAmount = ethers.parseUnits('100', tokenConfig.DAI.decimals);
      const tx = await executeAction({
        type: 'Curve3PoolSwap',
        tokenIn: 'DAI',
        tokenOut: 'USDC',
        amount: swapAmount,
      });
      const logs = (await decodeLoggerLog(tx)) as Curve3PoolSwapLog[];
      const log = logs[0];

      expect(log.eventId).to.equal(BigInt(ACTION_LOG_IDS.CURVE_3POOL_SWAP));
      expect(log.safeAddress).to.equal(safeAddr);
      expect(log.fromToken).to.equal(BigInt(CURVE_3POOL_INDICES.DAI));
      expect(log.toToken).to.equal(BigInt(CURVE_3POOL_INDICES.USDC));
      expect(log.amountIn).to.equal(swapAmount);
      expect(log.minAmountOut).to.equal(1n);
      expect(log.actualAmountOut).to.be.greaterThan(0n);
    });
    it('Should have swap action type', async () => {
      const actionType = await curve3PoolSwap.actionType();
      expect(actionType).to.equal(actionTypes.SWAP_ACTION);
    });
  });
  describe('Edge cases', () => {
    it('should swap large amounts (10 million tokens)', async () => {
      await testSwap('DAI', 'USDC', 10000000);
    });

    it('should fail when swapping zero amount', async () => {
      await expect(
        executeAction({
          type: 'Curve3PoolSwap',
          tokenIn: 'DAI',
          tokenOut: 'USDC',
          amount: '0',
        })
      ).to.be.revertedWith('GS013');
    });
  });
  describe('Slippage protection', () => {
    it('should fail when slippage is too high', async () => {
      // The transaction should revert due to unrealistic slippage expectation
      await expect(
        executeAction({
          type: 'Curve3PoolSwap',
          tokenIn: 'DAI',
          tokenOut: 'USDC',
          amount: '10',
          minAmount: '1000',
        })
      ).to.be.revertedWith('GS013');
    });
  });
  describe.skip('Multi-step transactions', () => {
    it('should perform multiple swaps in a single transaction', async () => {
      // lets wait for more of the sdk to be implemented before we implement this test
      // TODO: Is this test more of a check that the safe can handle multiple transactions?
    });
  });
  describe('Error handling', () => {
    it('should fail with invalid token indices', async () => {
      // Not using the safe as it obsfucates the error message
      const swapAmount = ethers.parseUnits('10', tokenConfig.USDC.decimals);
      await fundAccountWithToken(await curve3PoolSwap.getAddress(), 'USDC', 100);

      const params = {
        fromToken: 1,
        toToken: 42, // invalid token index
        amountIn: swapAmount,
        minAmountOut: 0,
      };

      const abiCoder = new ethers.AbiCoder();
      const paramsEncoded = abiCoder.encode([Curve3PoolSwapParams], [params]);

      await expect(curve3PoolSwap.executeAction(paramsEncoded, 0)).to.be.revertedWithCustomError(
        curve3PoolSwap,
        'Curve3Pool__InvalidTokenIndices'
      );
    });
    it('should fail with matching token indices', async () => {
      const swapAmount = ethers.parseUnits('10', tokenConfig.USDC.decimals);
      await fundAccountWithToken(await curve3PoolSwap.getAddress(), 'USDC', 1000);
      const params = {
        fromToken: 0,
        toToken: 0,
        amountIn: swapAmount,
        minAmountOut: 0,
      };

      const abiCoder = new ethers.AbiCoder();
      const paramsEncoded = abiCoder.encode([Curve3PoolSwapParams], [params]);
      await expect(curve3PoolSwap.executeAction(paramsEncoded, 0)).to.be.revertedWithCustomError(
        curve3PoolSwap,
        'Curve3Pool__InvalidTokenIndices'
      );
    });
  });
});

export {};
