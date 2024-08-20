import {
  ethers,
  expect,
  constants,
  deploySafe,
  deploySetup,
  fundAccountWithStablecoin,
  executeSafeTransaction,
  Signer,
  Contract,
  IERC20,
  ISafe,
  getUSDC,
  getUSDT,
} from '../..';

describe('Curve3PoolSwap tests', () => {
  let signer: Signer;
  let safe: ISafe;
  let curve3PoolSwap: Contract;
  let USDC: IERC20;
  let USDT: IERC20;

  before(async () => {
    [signer] = await ethers.getSigners();
    safe = await ethers.getContractAt('ISafe', await deploySafe(signer));

    const { swap } = await deploySetup();
    curve3PoolSwap = swap;
    USDC = await getUSDC();
    USDT = await getUSDT();
  });

  it('should swap USDC to USDT', async () => {
    const safeAddress = await safe.getAddress();
    const fundAmount = 1000; // 1000 USDC
    await fundAccountWithStablecoin(safeAddress, 'USDC', fundAmount);

    const initialUsdcBalance = await USDC.balanceOf(safeAddress);
    expect(initialUsdcBalance).to.equal(ethers.parseUnits(fundAmount.toString(), 6));

    // Prepare swap parameters
    const swapAmount = ethers.parseUnits('10', constants.tokenConfig.USDC.decimals); // 10 USDC
    const params = {
      fromToken: constants.CURVE_3POOL_INDICES.USDC,
      toToken: constants.CURVE_3POOL_INDICES.USDT,
      amountIn: swapAmount,
      minAmountOut: ethers.parseUnits('9.9', constants.tokenConfig.USDT.decimals), // Set a reasonable min amount
      from: safeAddress,
      to: safeAddress,
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
    await USDC.connect(signer).approve(safeAddress, swapAmount);

    // Execute swap
    await executeSafeTransaction(
      safeAddress,
      curve3PoolSwapAddress,
      0,
      encodedFunctionCall,
      1,
      signer
    );

    // Check balances after swap
    const finalUsdcBalance = await USDC.balanceOf(safeAddress);
    const finalUsdtBalance = await USDT.balanceOf(safeAddress);

    expect(finalUsdcBalance).to.be.lt(initialUsdcBalance);
    expect(finalUsdtBalance).to.be.gt(0);
  });
});

export {};
