import { CoverAsset } from '@nexusmutual/sdk';
import { ethers } from 'ethers';
import { tokenConfig } from './constants';
import { getBytes4 } from './utils';
import { ParaswapSwapParams } from './params';

export const actionTypes = {
  DEPOSIT_ACTION: 0,
  WITHDRAW_ACTION: 1,
  SWAP_ACTION: 2,
  COVER_ACTION: 3,
  FEE_ACTION: 4,
  TRANSFER_ACTION: 5,
  CUSTOM_ACTION: 6,
};

// Base interface for common properties
interface BaseActionArgs {
  useSDK?: boolean;
  value?: number;
  safeOperation?: number;
  safeAddress?: string;
  signer?: ethers.Signer;
  encoding?: {
    inputParams: string[];
    encodingVariables: string[];
  };
  sdkArgs?: string[];
  safeTxGas?: number;
  gasPrice?: number;
  baseGas?: number;
  debug?: boolean;
}

// Share-based withdraw specific args
interface ShareBasedWithdrawArgs extends BaseActionArgs {
  poolAddress?: string;
  feeBasis?: number;
  sharesToBurn?: string | BigInt;
  minUnderlyingReceived?: string | BigInt;
}

// Standard ERC4626 withdraw args
interface ERC4626WithdrawArgs extends BaseActionArgs {
  poolAddress?: string;
  feeBasis?: number;
  amount?: string | BigInt;
  maxSharesBurned?: string | BigInt;
}

// Union type for different withdraw implementations
type WithdrawArgs =
  | (ERC4626WithdrawArgs & {
      type:
        | 'FluidV1Withdraw'
        | 'ClearpoolWithdraw'
        | 'SparkV1Withdraw'
        | 'AcrossV3Withdraw'
        | 'MorphoV1Withdraw'
        | 'YearnV3Withdraw'
        | 'GearboxPassiveV3Withdraw';
    })
  | (ShareBasedWithdrawArgs & { type: 'NotionalV3Withdraw' | 'YearnV2Withdraw' | 'VesperV1Withdraw' });

// Specific interfaces for each action type
interface SupplyArgs extends BaseActionArgs {
  type:
    | 'FluidV1Supply'
    | 'YearnV2Supply'
    | 'ClearpoolSupply'
    | 'SparkV1Supply'
    | 'AcrossV3Supply'
    | 'MorphoV1Supply'
    | 'VesperV1Supply'
    | 'NotionalV3Supply'
    | 'YearnV3Supply'
    | 'GearboxPassiveV3Supply';
  poolAddress?: string;
  feeBasis?: number;
  amount?: string | BigInt;
  minSharesReceived?: string | BigInt;
}

interface SwapArgs extends BaseActionArgs {
  type: 'Curve3PoolSwap';
  tokenIn: keyof typeof tokenConfig;
  tokenOut: keyof typeof tokenConfig;
  amount: string | BigInt;
  minAmount?: string;
}

interface ParaswapSwapArgs extends BaseActionArgs {
  type: 'ParaswapSwap';
  tokenIn: keyof typeof tokenConfig;
  tokenOut: keyof typeof tokenConfig;
  fromAmount: string | BigInt;
  minToAmount: string;
  swapCallData?: string;
  tokenInAddress?: string;
  tokenOutAddress?: string;
}

interface TokenTransferArgs extends BaseActionArgs {
  type: 'PullToken' | 'SendToken';
  token?: keyof typeof tokenConfig;
  tokenAddress?: string;
  amount: string | BigInt;
  from?: string;
  to?: string;
}

export interface BuyCoverArgs extends BaseActionArgs {
  type: 'BuyCover';
  productId: number;
  amountToInsure: string;
  daysToInsure: number;
  coverAddress?: string;
  coverAsset: CoverAsset;
}

export interface AaveV3Args extends BaseActionArgs {
  type: 'AaveV3Supply' | 'AaveV3Withdraw';
  assetId: string;
  amount: string | BigInt;
  feeBasis?: number;
}

export interface AaveV2Args extends BaseActionArgs {
  type: 'AaveV2Supply' | 'AaveV2Withdraw';
  assetId: string;
  amount: string | BigInt;
  feeBasis?: number;
}

interface StrikeArgs extends BaseActionArgs {
  type: 'StrikeV1Supply' | 'StrikeV1Withdraw';
  assetId: string;
  amount: string | BigInt;
  feeBasis?: number;
}

export interface UwULendV1Args extends BaseActionArgs {
  type: 'UwULendV1Supply' | 'UwULendV1Withdraw';
  assetId: string;
  amount: string | BigInt;
  feeBasis?: number;
}

export interface BendDaoV1Args extends BaseActionArgs {
  type: 'BendDaoV1Supply' | 'BendDaoV1Withdraw';
  assetId?: string;
  amount?: string | BigInt;
  feeBasis?: number;
}

interface UpgradeArgs extends BaseActionArgs {
  type: 'UpgradeAction';
  data: string;
}

export interface ClearpoolV1Args extends BaseActionArgs {
  poolAddress: string;
  amount: string | BigInt;
  feeBasis?: number;
  minSharesReceived?: string | BigInt;
  maxSharesBurned?: string | BigInt;
}

// Union type for all action args
export type ActionArgs =
  | (ClearpoolV1Args & { type: 'ClearpoolV1Supply' | 'ClearpoolV1Withdraw' })
  | (AaveV2Args & { type: 'AaveV2Supply' | 'AaveV2Withdraw' })
  | (AaveV3Args & { type: 'AaveV3Supply' | 'AaveV3Withdraw' })
  | (BendDaoV1Args & { type: 'BendDaoV1Supply' | 'BendDaoV1Withdraw' })
  | SupplyArgs
  | WithdrawArgs
  | SwapArgs
  | ParaswapSwapArgs
  | TokenTransferArgs
  | BuyCoverArgs
  | StrikeArgs
  | UwULendV1Args
  | UpgradeArgs;

/// @dev this is the default values for each action type
export const actionDefaults: Record<string, ActionArgs> = {
  FluidV1Supply: {
    type: 'FluidV1Supply',
    useSDK: false,
    value: 0,
    safeOperation: 1,
    poolAddress: tokenConfig.FLUID_V1_USDC.address,
    feeBasis: 0,
    amount: '0',
    minSharesReceived: '0',
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256', 'uint256'],
      encodingVariables: ['poolId', 'feeBasis', 'amount', 'minSharesReceived'],
    },
    sdkArgs: ['poolAddress', 'amount', 'minSharesReceived', 'feeBasis'],
  },
  FluidV1Withdraw: {
    type: 'FluidV1Withdraw',
    useSDK: false,
    value: 0,
    safeOperation: 1,
    poolAddress: tokenConfig.FLUID_V1_USDC.address,
    feeBasis: 0,
    amount: '0',
    maxSharesBurned: ethers.MaxUint256.toString(),
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256', 'uint256'],
      encodingVariables: ['poolId', 'feeBasis', 'amount', 'maxSharesBurned'],
    },
    sdkArgs: ['poolAddress', 'amount', 'maxSharesBurned', 'feeBasis'],
  },
  YearnV2Supply: {
    type: 'YearnV2Supply',
    useSDK: false,
    value: 0,
    safeOperation: 1,
    poolAddress: tokenConfig.YEARN_V2_USDC.address,
    feeBasis: 0,
    amount: '0',
    minSharesReceived: '0',
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256', 'uint256'],
      encodingVariables: ['poolId', 'feeBasis', 'amount', 'minSharesReceived'],
    },
  },
  YearnV2Withdraw: {
    type: 'YearnV2Withdraw',
    useSDK: false,
    value: 0,
    safeOperation: 1,
    poolAddress: tokenConfig.YEARN_V2_USDC.address,
    feeBasis: 0,
    sharesToBurn: '0',
    minUnderlyingReceived: '0',
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256', 'uint256'],
      encodingVariables: ['poolId', 'feeBasis', 'sharesToBurn', 'minUnderlyingReceived'],
    },
  },
  VesperV1Supply: {
    type: 'VesperV1Supply',
    useSDK: false,
    value: 0,
    safeOperation: 1,
    poolAddress: tokenConfig.VESPER_V1_USDC.address,
    feeBasis: 0,
    amount: '0',
    minSharesReceived: '0',
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256', 'uint256'],
      encodingVariables: ['poolId', 'feeBasis', 'amount', 'minSharesReceived'],
    },
  },
  VesperV1Withdraw: {
    type: 'VesperV1Withdraw',
    useSDK: false,
    value: 0,
    safeOperation: 1,
    poolAddress: tokenConfig.VESPER_V1_USDC.address,
    feeBasis: 0,
    sharesToBurn: '0',
    minUnderlyingReceived: '0',
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256', 'uint256'],
      encodingVariables: ['poolId', 'feeBasis', 'sharesToBurn', 'minUnderlyingReceived'],
    },
  },
  Curve3PoolSwap: {
    type: 'Curve3PoolSwap',
    useSDK: false,
    tokenIn: 'USDC',
    tokenOut: 'USDT',
    amount: '0',
    minAmount: '1', //must be non-zero
    value: 0,
    safeOperation: 1,
    encoding: {
      inputParams: ['int128', 'int128', 'uint256', 'uint256'],
      encodingVariables: ['fromToken', 'toToken', 'amount', 'minAmount'],
    },
  },
  ParaswapSwap: {
    type: 'ParaswapSwap',
    useSDK: false,
    value: 0,
    safeOperation: 1,
    tokenIn: 'USDC',
    tokenOut: 'USDT',
    fromAmount: '0',
    minToAmount: '1',
    swapCallData: '0x',
    encoding: {
      inputParams: ['address', 'address', 'uint256', 'uint256', 'bytes'],
      encodingVariables: ['tokenInAddress', 'tokenOutAddress', 'fromAmount', 'minToAmount', 'swapCallData'],
    },
  },
  PullToken: {
    type: 'PullToken',
    useSDK: false,
    value: 0,
    safeOperation: 1,
    token: 'USDC',
    amount: '0',
    encoding: {
      inputParams: ['address', 'address', 'uint256'],
      encodingVariables: ['tokenAddress', 'from', 'amount'],
    },
  },
  SendToken: {
    type: 'SendToken',
    useSDK: false,
    value: 0,
    safeOperation: 1,
    token: 'USDC',
    amount: '0',
    encoding: {
      inputParams: ['address', 'address', 'uint256'],
      encodingVariables: ['tokenAddress', 'to', 'amount'],
    },
  },
  BuyCover: {
    type: 'BuyCover',
    useSDK: true,
    productId: 152, // this pool allows all payment types
    amountToInsure: '1.0',
    daysToInsure: 28,
    coverAsset: CoverAsset.DAI,
    value: 0,
    safeOperation: 1,
  },
  AaveV3Supply: {
    useSDK: false,
    type: 'AaveV3Supply',
    assetId: getBytes4(tokenConfig.AAVE_V3_aUSDC.address),
    amount: '0',
    feeBasis: 0,
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256'],
      encodingVariables: ['assetId', 'feeBasis', 'amount'],
    },
    value: 0,
    safeOperation: 1,
  },
  AaveV3Withdraw: {
    type: 'AaveV3Withdraw',
    assetId: getBytes4(tokenConfig.AAVE_V3_aUSDC.address),
    amount: '0',
    feeBasis: 0,
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256'],
      encodingVariables: ['assetId', 'feeBasis', 'amount'],
    },
    value: 0,
    safeOperation: 1,
  },
  AaveV2Withdraw: {
    type: 'AaveV2Withdraw',
    assetId: getBytes4(tokenConfig.AAVE_V2_aUSDC.address),
    amount: '0',
    feeBasis: 0,
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256'],
      encodingVariables: ['assetId', 'feeBasis', 'amount'],
    },
    value: 0,
    safeOperation: 1,
  },
  AaveV2Supply: {
    type: 'AaveV2Supply',
    assetId: getBytes4(tokenConfig.AAVE_V2_aUSDC.address),
    amount: '0',
    feeBasis: 0,
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256'],
      encodingVariables: ['assetId', 'feeBasis', 'amount'],
    },
    value: 0,
    safeOperation: 1,
  },
  StrikeV1Withdraw: {
    type: 'StrikeV1Withdraw',
    assetId: getBytes4(tokenConfig.STRIKE_V1_USDC.address),
    amount: '0',
    feeBasis: 0,
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256'],
      encodingVariables: ['assetId', 'feeBasis', 'amount'],
    },
    value: 0,
    safeOperation: 1,
  },
  StrikeV1Supply: {
    type: 'StrikeV1Supply',
    assetId: getBytes4(tokenConfig.STRIKE_V1_USDC.address),
    amount: '0',
    feeBasis: 0,
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256'],
      encodingVariables: ['assetId', 'feeBasis', 'amount'],
    },
    value: 0,
    safeOperation: 1,
  },
  ClearpoolV1Supply: {
    type: 'ClearpoolV1Supply',
    useSDK: false,
    value: 0,
    safeOperation: 1,
    poolAddress: tokenConfig.CLEARPOOL_V1_ALP_USDC.address,
    feeBasis: 0,
    amount: '0',
    minSharesReceived: '0',
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256', 'uint256'],
      encodingVariables: ['poolId', 'feeBasis', 'amount', 'minSharesReceived'],
    },
  },
  ClearpoolV1Withdraw: {
    type: 'ClearpoolV1Withdraw',
    useSDK: false,
    value: 0,
    safeOperation: 1,
    poolAddress: tokenConfig.CLEARPOOL_V1_ALP_USDC.address,
    feeBasis: 0,
    amount: '0',
    maxSharesBurned: ethers.MaxUint256.toString(),
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256', 'uint256'],
      encodingVariables: ['poolId', 'feeBasis', 'amount', 'maxSharesBurned'],
    },
  },
  UwULendV1Withdraw: {
    type: 'UwULendV1Withdraw',
    assetId: getBytes4(tokenConfig.UWU_V1_USDT.address),
    amount: '0',
    feeBasis: 0,
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256'],
      encodingVariables: ['assetId', 'feeBasis', 'amount'],
    },
    value: 0,
    safeOperation: 1,
  },
  UwULendV1Supply: {
    type: 'UwULendV1Supply',
    assetId: getBytes4(tokenConfig.UWU_V1_USDT.address),
    amount: '0',
    feeBasis: 0,
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256'],
      encodingVariables: ['assetId', 'feeBasis', 'amount'],
    },
    value: 0,
    safeOperation: 1,
  },
  BendDaoV1Supply: {
    type: 'BendDaoV1Supply',
    assetId: getBytes4(tokenConfig.BEND_V1_USDT.address),
    amount: '0',
    feeBasis: 0,
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256'],
      encodingVariables: ['assetId', 'feeBasis', 'amount'],
    },
    value: 0,
    safeOperation: 1,
  },
  BendDaoV1Withdraw: {
    type: 'BendDaoV1Withdraw',
    assetId: getBytes4(tokenConfig.BEND_V1_USDT.address),
    amount: '0',
    feeBasis: 0,
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256'],
      encodingVariables: ['assetId', 'feeBasis', 'amount'],
    },
    value: 0,
    safeOperation: 1,
  },
  SparkV1Supply: {
    type: 'SparkV1Supply',
    useSDK: false,
    value: 0,
    safeOperation: 1,
    poolAddress: tokenConfig.SPARK_V1_DAI.address,
    feeBasis: 0,
    amount: '0',
    minSharesReceived: '0',
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256', 'uint256'],
      encodingVariables: ['poolId', 'feeBasis', 'amount', 'minSharesReceived'],
    },
  },
  SparkV1Withdraw: {
    type: 'SparkV1Withdraw',
    useSDK: false,
    value: 0,
    safeOperation: 1,
    poolAddress: tokenConfig.SPARK_V1_DAI.address,
    feeBasis: 0,
    amount: '0',
    maxSharesBurned: ethers.MaxUint256.toString(),
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256', 'uint256'],
      encodingVariables: ['poolId', 'feeBasis', 'amount', 'maxSharesBurned'],
    },
  },
  AcrossV3Supply: {
    type: 'AcrossV3Supply',
    useSDK: false,
    value: 0,
    safeOperation: 1,
    poolAddress: tokenConfig.ACROSS_V3_lpUSDC.address,
    feeBasis: 0,
    amount: '0',
    minSharesReceived: '0',
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256', 'uint256'],
      encodingVariables: ['poolId', 'feeBasis', 'amount', 'minSharesReceived'],
    },
  },
  AcrossV3Withdraw: {
    type: 'AcrossV3Withdraw',
    useSDK: false,
    value: 0,
    safeOperation: 1,
    poolAddress: tokenConfig.ACROSS_V3_lpUSDC.address,
    feeBasis: 0,
    amount: '0',
    maxSharesBurned: ethers.MaxUint256.toString(),
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256', 'uint256'],
      encodingVariables: ['poolId', 'feeBasis', 'amount', 'maxSharesBurned'],
    },
  },
  MorphoV1Supply: {
    type: 'MorphoV1Supply',
    useSDK: false,
    value: 0,
    safeOperation: 1,
    poolAddress: tokenConfig.MORPHO_V1_fxUSDC.address,
    feeBasis: 0,
    amount: '0',
    minSharesReceived: '0',
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256', 'uint256'],
      encodingVariables: ['poolId', 'feeBasis', 'amount', 'minSharesReceived'],
    },
    sdkArgs: ['poolAddress', 'amount', 'minSharesReceived', 'feeBasis'],
  },
  MorphoV1Withdraw: {
    type: 'MorphoV1Withdraw',
    useSDK: false,
    value: 0,
    safeOperation: 1,
    poolAddress: tokenConfig.MORPHO_V1_fxUSDC.address,
    feeBasis: 0,
    amount: '0',
    maxSharesBurned: ethers.MaxUint256.toString(),
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256', 'uint256'],
      encodingVariables: ['poolId', 'feeBasis', 'amount', 'maxSharesBurned'],
    },
    sdkArgs: ['poolAddress', 'amount', 'maxSharesBurned', 'feeBasis'],
  },
  YearnV3Supply: {
    type: 'YearnV3Supply',
    useSDK: false,
    value: 0,
    safeOperation: 1,
    poolAddress: tokenConfig.YEARN_V3_DAI.address,
    feeBasis: 0,
    amount: '0',
    minSharesReceived: '0',
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256', 'uint256'],
      encodingVariables: ['poolId', 'feeBasis', 'amount', 'minSharesReceived'],
    },
  },
  YearnV3Withdraw: {
    type: 'YearnV3Withdraw',
    useSDK: false,
    value: 0,
    safeOperation: 1,
    poolAddress: tokenConfig.YEARN_V3_DAI.address,
    feeBasis: 0,
    amount: '0',
    maxSharesBurned: ethers.MaxUint256.toString(),
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256', 'uint256'],
      encodingVariables: ['poolId', 'feeBasis', 'amount', 'maxSharesBurned'],
    },
  },
  NotionalV3Supply: {
    type: 'NotionalV3Supply',
    useSDK: false,
    value: 0,
    safeOperation: 1,
    poolAddress: tokenConfig.NOTIONAL_V3_USDC.address,
    feeBasis: 0,
    amount: '0',
    minSharesReceived: '0',
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256', 'uint256'],
      encodingVariables: ['poolId', 'feeBasis', 'amount', 'minSharesReceived'],
    },
  },
  NotionalV3Withdraw: {
    type: 'NotionalV3Withdraw',
    useSDK: false,
    value: 0,
    safeOperation: 1,
    poolAddress: tokenConfig.NOTIONAL_V3_USDC.address,
    feeBasis: 0,
    sharesToBurn: '0',
    minUnderlyingReceived: '0',
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256', 'uint256'],
      encodingVariables: ['poolId', 'feeBasis', 'sharesToBurn', 'minUnderlyingReceived'],
    },
  },
  GearboxPassiveV3Supply: {
    type: 'GearboxPassiveV3Supply',
    useSDK: false,
    value: 0,
    safeOperation: 1,
    poolAddress: tokenConfig.GEARBOX_PASSIVE_V3_USDC.address,
    feeBasis: 0,
    amount: '0',
    minSharesReceived: '0',
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256', 'uint256'],
      encodingVariables: ['poolId', 'feeBasis', 'amount', 'minSharesReceived'],
    },
  },
  GearboxPassiveV3Withdraw: {
    type: 'GearboxPassiveV3Withdraw',
    useSDK: false,
    value: 0,
    safeOperation: 1,
    poolAddress: tokenConfig.GEARBOX_PASSIVE_V3_USDC.address,
    feeBasis: 0,
    amount: '0',
    maxSharesBurned: ethers.MaxUint256.toString(),
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256', 'uint256'],
      encodingVariables: ['poolId', 'feeBasis', 'amount', 'maxSharesBurned'],
    },
  },
  UpgradeAction: {
    type: 'UpgradeAction',
    useSDK: false,
    data: '0x',
    encoding: {
      inputParams: ['bytes'],
      encodingVariables: ['data']
    }
  },
};
