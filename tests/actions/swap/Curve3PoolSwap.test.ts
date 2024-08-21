import { ethers, Signer, expect } from '../..';
import { network } from 'hardhat';
import { Curve3PoolSwap, IERC20 } from '../../../typechain-types';
import { CURVE_3POOL_ADDRESS, CURVE_3POOL_INDICES, tokenConfig } from '../../../tests/constants';
import { deploy, log, getBaseSetup } from '../../utils';
import { executeSafeTransaction } from 'athena-sdk';
import { fundAccountWithStablecoin, getStables } from '../../utils-stable';

// These tests function, but are far from complete

describe('Curve3PoolSwap tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let curve3PoolSwap: Curve3PoolSwap;
  let USDC: IERC20, USDT: IERC20, DAI: IERC20;
  let snapshotId: string;

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
    log('Reverting to local snapshot');
    await network.provider.send('evm_revert', [snapshotId]);
  });

  it('should swap USDC to USDT', async () => {
    const fundAmount = 1000; // 1000 USDC
    await fundAccountWithStablecoin(safeAddr, 'USDC', fundAmount);

    const initialUsdcBalance = await USDC.balanceOf(safeAddr);
    expect(initialUsdcBalance).to.equal(ethers.parseUnits(fundAmount.toString(), 6));

    // Prepare swap parameters
    const swapAmount = ethers.parseUnits('10', tokenConfig.USDC.decimals); // 10 USDC
    const params = {
      fromToken: CURVE_3POOL_INDICES.USDC,
      toToken: CURVE_3POOL_INDICES.USDT,
      amountIn: swapAmount,
      minAmountOut: ethers.parseUnits('9.9', tokenConfig.USDT.decimals), // Set a reasonable min amount
      from: safeAddr,
      to: safeAddr,
    };

    const abiCoder = new ethers.AbiCoder();
    const paramsEncoded = abiCoder.encode(
      [
        'tuple(int128 fromToken, int128 toToken, uint256 amountIn, uint256 minAmountOut, address from, address to)',
      ],
      [params]
    );

    const curve3PoolSwapAddress = await curve3PoolSwap.getAddress();
    const encodedFunctionCall = curve3PoolSwap.interface.encodeFunctionData('executeActionDirect', [
      paramsEncoded,
    ]);

    // Approve USDC spending
    await USDC.connect(signer).approve(safeAddr, swapAmount);

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
    const finalUsdcBalance = await USDC.balanceOf(safeAddr);
    const finalUsdtBalance = await USDT.balanceOf(safeAddr);

    expect(finalUsdcBalance).to.be.lt(initialUsdcBalance);
    expect(finalUsdtBalance).to.be.gt(0);
  });

  it('should swap USDT to USDC', async () => {
    const fundAmount = 1000; // 1000 USDT
    await fundAccountWithStablecoin(safeAddr, 'USDT', fundAmount);

    const initialUsdtBalance = await USDT.balanceOf(safeAddr);
    expect(initialUsdtBalance).to.equal(ethers.parseUnits(fundAmount.toString(), 6));

    // Prepare swap parameters
    const swapAmount = ethers.parseUnits('10', tokenConfig.USDT.decimals); // 10 USDT
    const params = {
      fromToken: CURVE_3POOL_INDICES.USDT,
      toToken: CURVE_3POOL_INDICES.USDC,
      amountIn: swapAmount,
      minAmountOut: ethers.parseUnits('9.9', tokenConfig.USDC.decimals), // Set a reasonable min amount
      from: safeAddr,
      to: safeAddr,
    };

    const abiCoder = new ethers.AbiCoder();
    const paramsEncoded = abiCoder.encode(
      [
        'tuple(int128 fromToken, int128 toToken, uint256 amountIn, uint256 minAmountOut, address from, address to)',
      ],
      [params]
    );

    const curve3PoolSwapAddress = await curve3PoolSwap.getAddress();
    const encodedFunctionCall = curve3PoolSwap.interface.encodeFunctionData('executeActionDirect', [
      paramsEncoded,
    ]);

    // Approve USDT spending
    await USDT.connect(signer).approve(safeAddr, swapAmount);

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
    const finalUsdtBalance = await USDT.balanceOf(safeAddr);
    const finalUsdcBalance = await USDC.balanceOf(safeAddr);

    expect(finalUsdtBalance).to.be.lt(initialUsdtBalance);
    expect(finalUsdcBalance).to.be.gt(0);
  });
});

export {};
