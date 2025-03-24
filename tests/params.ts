export const Curve3PoolSwapParams =
  'tuple(int128 fromToken, int128 toToken, uint256 amountIn, uint256 minAmountOut)';

export const ParaswapSwapParams =
  'tuple(address tokenInAddress, address tokenOutAddress, uint256 fromAmount, uint256 minToAmount, bytes swapCallData)';

export const NexusMutualBuyCoverParamTypes =
  'tuple(uint256  coverId, address owner, uint24 productId, uint8 coverAsset, uint96 amount, uint32 period, uint256 maxPremiumInAsset, uint8 paymentAsset, uint24 commissionRatio, address commissionDestination, string ipfsData)';

export const NexusMutualPoolAllocationRequestTypes =
  'tuple(uint40 poolId, bool skip, uint256 coverAmountInAsset)';

export const BuyCoverInputTypes =
  'tuple(address owner, bytes buyCoverParams, bytes[] poolAllocationRequests)';
