import 'dotenv/config';
import { ethers } from 'hardhat';
import { deploySetup } from './deploy-setup';
import { deploySafe, executeSafeTransaction } from './safe';
import { fundAccountWithStablecoin } from './stablecoin-fund';
import { tokenConfig } from './constants';

async function testCurve3PoolSwap() {
  console.log('Testing Curve 3Pool Swap (USDC to USDT)');

  const { contractRegistry, swap } = await deploySetup();
  const signer = (await ethers.getSigners())[0];
  const signerAddr = await signer.getAddress();
  const safeAddr = await deploySafe(signer);

  const abiCoder = new ethers.AbiCoder();

  // Get the Curve3PoolSwap contract address from the registry
  const curve3PoolSwapAddress = await swap.getAddress();
  const curve3PoolSwap = await ethers.getContractAt('Curve3PoolSwap', curve3PoolSwapAddress);

  // USDC and USDT addresses (mainnet)
  const USDC_ADDRESS = tokenConfig.USDC.address;
  const USDT_ADDRESS = tokenConfig.USDT.address;

  // Approve USDC spending
  const usdcContract = await ethers.getContractAt('IERC20', USDC_ADDRESS);
  const swapAmount = ethers.parseUnits('10', 6); // 10 USDC
  await usdcContract.approve(curve3PoolSwapAddress, swapAmount);

  // Prepare swap parameters
  const params = {
    fromToken: 1, // USDC index in 3pool
    toToken: 2, // USDT index in 3pool
    amountIn: swapAmount,
    minAmountOut: 0, // Set a proper min amount in production
    from: await signer.getAddress(),
    to: await signer.getAddress(),
  };

  const paramsEncoded = abiCoder.encode(
    [
      'tuple(int128 fromToken, int128 toToken, uint256 amountIn, uint256 minAmountOut, address from, address to)',
    ],
    [params]
  );

  const encodedFunctionCall = curve3PoolSwap.interface.encodeFunctionData('executeActionDirect', [
    paramsEncoded,
  ]);

  // fund the safe with some USDC
  await fundAccountWithStablecoin(safeAddr, 'USDC', 1000);
  await fundAccountWithStablecoin(await signer.getAddress(), 'USDC', 1000);

  // approve the safe to spend USDC
  await usdcContract.approve(safeAddr, swapAmount);

  // check USDC balance
  const usdcBalance = await usdcContract.balanceOf(safeAddr);
  console.log('USDC balance before swap:', ethers.formatUnits(usdcBalance, 6));

  // Execute swap
  const txResponse = await executeSafeTransaction(
    safeAddr,
    curve3PoolSwapAddress,
    0,
    encodedFunctionCall,
    1,
    signer
  );

  const receipt = await txResponse.wait();
  console.log('Swap transaction hash:', receipt?.hash ?? 'Transaction failed');
  // Check USDT balance after swap
  const usdtContract = await ethers.getContractAt('IERC20', USDT_ADDRESS);
  const usdtBalance = await usdtContract.balanceOf(safeAddr);
  console.log('USDT balance after swap:', ethers.formatUnits(usdtBalance, 6));

  /*
  // More tests Required:
  // - Swap in all 6 directions
  // - Swap beyond slippage limits
  // - fail swapping a token with itself
  // - fail swapping a token with an invalid token
  // - fail swapping a token with an invalid amount
  // - fail swapping a token with an invalid min amount
  */
}

async function main() {
  await testCurve3PoolSwap();
}

main().catch(console.error);
