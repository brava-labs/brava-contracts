import { ethers, Signer, expect } from '../..';
import { network } from 'hardhat';
import { Curve3PoolSwap, IERC20 } from '../../../typechain-types';
import { CURVE_3POOL_ADDRESS, CURVE_3POOL_INDICES, tokenConfig } from '../../../tests/constants';
import { deploy, log, getBaseSetup } from '../../utils';
import { executeSafeTransaction } from 'athena-sdk';
import { fundAccountWithStablecoin, getStables } from '../../utils-stable';
import { BigNumberish } from 'ethers';
import { Curve3PoolSwapParams } from '../../params';
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
  let USDC: IERC20, USDT: IERC20, DAI: IERC20;
  let snapshotId: string;

  function prepareSwapParameters(
    curve3PoolSwap: Curve3PoolSwap,
    params: SwapParams
  ): Promise<[string, string]> {
    const abiCoder = new ethers.AbiCoder();
    const paramsEncoded = abiCoder.encode([Curve3PoolSwapParams], [params]);

    return curve3PoolSwap
      .getAddress()
      .then((curve3PoolSwapAddress) => [
        curve3PoolSwapAddress,
        curve3PoolSwap.interface.encodeFunctionData('executeActionDirect', [paramsEncoded]),
      ]);
  }

  async function testSwap(
    fromToken: 'USDC' | 'USDT' | 'DAI',
    toToken: 'USDC' | 'USDT' | 'DAI',
    fundAmount: number
  ) {
    await fundAccountWithStablecoin(safeAddr, fromToken, fundAmount);

    const FromToken = eval(fromToken);
    const ToToken = eval(toToken);
    const initialFromBalance = await FromToken.balanceOf(safeAddr);
    const initialToBalance = await ToToken.balanceOf(safeAddr);

    expect(initialFromBalance).to.equal(
      ethers.parseUnits(fundAmount.toString(), tokenConfig[fromToken].decimals)
    );
    expect(initialToBalance).to.equal(0);

    const swapAmount = ethers.parseUnits(fundAmount.toString(), tokenConfig[fromToken].decimals);
    const params: SwapParams = {
      fromToken: CURVE_3POOL_INDICES[fromToken],
      toToken: CURVE_3POOL_INDICES[toToken],
      amountIn: swapAmount,
      minAmountOut: ethers.parseUnits(
        (fundAmount * 0.99).toString(),
        tokenConfig[toToken].decimals
      ),
    };

    const [curve3PoolSwapAddress, encodedFunctionCall] = await prepareSwapParameters(
      curve3PoolSwap,
      params
    );

    // Execute swap
    await executeSafeTransaction(
      safeAddr,
      curve3PoolSwapAddress,
      0,
      encodedFunctionCall,
      1,
      signer
    );

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
    safeAddr = baseSetup.safeAddr;

    // Deploy contracts specific to these tests
    curve3PoolSwap = await deploy(
      'Curve3PoolSwap',
      signer,
      baseSetup.contractRegistry.getAddress(),
      baseSetup.logger.getAddress(),
      CURVE_3POOL_ADDRESS
    );
    ({ USDC, USDT, DAI } = await getStables());

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
  });
  describe('Edge cases', () => {
    it('should swap large amounts (10 million tokens)', async () => {
      await testSwap('DAI', 'USDC', 10000000);
    });

    it('should fail when swapping zero amount', async () => {
      const params: SwapParams = {
        fromToken: CURVE_3POOL_INDICES.DAI,
        toToken: CURVE_3POOL_INDICES.USDC,
        amountIn: 0,
        minAmountOut: 0,
      };
      const [curve3PoolSwapAddress, encodedFunctionCall] = await prepareSwapParameters(
        curve3PoolSwap,
        params
      );
      await expect(
        executeSafeTransaction(safeAddr, curve3PoolSwapAddress, 0, encodedFunctionCall, 1, signer)
      ).to.be.revertedWith('GS013');
    });
  });
  describe.skip('Slippage protection', () => {
    it('should fail when slippage is too high', async () => {
      // TODO: Currently there is no slippage protection in the curve3PoolSwap contract
      // We should add it and then implement this test
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
      await fundAccountWithStablecoin(await curve3PoolSwap.getAddress(), 'USDC', 100);

      const params = {
        fromToken: 1,
        toToken: 42, // invalid token index
        amountIn: swapAmount,
        minAmountOut: 0,
      };

      const abiCoder = new ethers.AbiCoder();
      const paramsEncoded = abiCoder.encode([Curve3PoolSwapParams], [params]);

      await expect(curve3PoolSwap.executeActionDirect(paramsEncoded)).to.be.revertedWithCustomError(
        curve3PoolSwap,
        'InvalidTokenIndices'
      );
    });
    it('should fail with matching token indices', async () => {
      const swapAmount = ethers.parseUnits('10', tokenConfig.USDC.decimals);
      await fundAccountWithStablecoin(await curve3PoolSwap.getAddress(), 'USDC', 1000);
      const params = {
        fromToken: 0,
        toToken: 0,
        amountIn: swapAmount,
        minAmountOut: 0,
      };

      const abiCoder = new ethers.AbiCoder();
      const paramsEncoded = abiCoder.encode([Curve3PoolSwapParams], [params]);
      await expect(curve3PoolSwap.executeActionDirect(paramsEncoded)).to.be.revertedWithCustomError(
        curve3PoolSwap,
        'CannotSwapSameToken'
      );
    });
  });
});

export {};
