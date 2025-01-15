import { CoverAsset } from '@nexusmutual/sdk';
import { ethers } from 'ethers';
import { tokenConfig } from './constants';
import { getBytes4 } from './utils';

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
        | 'FluidWithdraw'
        | 'ClearpoolWithdraw'
        | 'SparkWithdraw'
        | 'AcrossWithdraw'
        | 'MorphoWithdraw'
        | 'YearnWithdrawV3'
        | 'GearboxPassiveWithdraw';
    })
  | (ShareBasedWithdrawArgs & { type: 'NotionalV3Withdraw' | 'YearnWithdraw' | 'VesperWithdraw' });

// Specific interfaces for each action type
interface SupplyArgs extends BaseActionArgs {
  type:
    | 'FluidSupply'
    | 'YearnSupply'
    | 'ClearpoolSupply'
    | 'SparkSupply'
    | 'AcrossSupply'
    | 'MorphoSupply'
    | 'VesperSupply'
    | 'NotionalV3Supply'
    | 'YearnSupplyV3'
    | 'GearboxPassiveSupply';
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
  type: 'StrikeSupply' | 'StrikeWithdraw';
  assetId: string;
  amount: string | BigInt;
  feeBasis?: number;
}

export interface UwULendArgs extends BaseActionArgs {
  type: 'UwULendSupply' | 'UwULendWithdraw';
  assetId: string;
  amount: string | BigInt;
  feeBasis?: number;
}

export interface BendDaoArgs extends BaseActionArgs {
  type: 'BendDaoSupply' | 'BendDaoWithdraw';
  assetId: string;
  amount: string | BigInt;
  feeBasis?: number;
}

interface UpgradeArgs extends BaseActionArgs {
  type: 'UpgradeAction';
  data: string;
}

// Union type for all action args
export type ActionArgs =
  | SupplyArgs
  | WithdrawArgs
  | SwapArgs
  | ParaswapSwapArgs
  | TokenTransferArgs
  | BuyCoverArgs
  | AaveV3Args
  | AaveV2Args
  | StrikeArgs
  | UwULendArgs
  | BendDaoArgs
  | UpgradeArgs;

/// @dev this is the default values for each action type
export const actionDefaults: Record<string, ActionArgs> = {
  FluidSupply: {
    type: 'FluidSupply',
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
  FluidWithdraw: {
    type: 'FluidWithdraw',
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
  YearnSupply: {
    type: 'YearnSupply',
    useSDK: false,
    value: 0,
    safeOperation: 1,
    poolAddress: tokenConfig.USDC.pools.yearn,
    feeBasis: 0,
    amount: '0',
    minSharesReceived: '0',
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256', 'uint256'],
      encodingVariables: ['poolId', 'feeBasis', 'amount', 'minSharesReceived'],
    },
  },
  YearnWithdraw: {
    type: 'YearnWithdraw',
    useSDK: false,
    value: 0,
    safeOperation: 1,
    poolAddress: tokenConfig.USDC.pools.yearn,
    feeBasis: 0,
    sharesToBurn: '0',
    minUnderlyingReceived: '0',
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256', 'uint256'],
      encodingVariables: ['poolId', 'feeBasis', 'sharesToBurn', 'minUnderlyingReceived'],
    },
  },
  VesperSupply: {
    type: 'VesperSupply',
    useSDK: false,
    value: 0,
    safeOperation: 1,
    poolAddress: tokenConfig.vaUSDC.address,
    feeBasis: 0,
    amount: '0',
    minSharesReceived: '0',
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256', 'uint256'],
      encodingVariables: ['poolId', 'feeBasis', 'amount', 'minSharesReceived'],
    },
  },
  VesperWithdraw: {
    type: 'VesperWithdraw',
    useSDK: false,
    value: 0,
    safeOperation: 1,
    poolAddress: tokenConfig.vaUSDC.address,
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
      encodingVariables: ['tokenIn', 'tokenOut', 'fromAmount', 'minToAmount', 'swapCallData'],
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
  StrikeWithdraw: {
    type: 'StrikeWithdraw',
    assetId: getBytes4(tokenConfig.sUSDC.address),
    amount: '0',
    feeBasis: 0,
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256'],
      encodingVariables: ['assetId', 'feeBasis', 'amount'],
    },
    value: 0,
    safeOperation: 1,
  },
  StrikeSupply: {
    type: 'StrikeSupply',
    assetId: getBytes4(tokenConfig.sUSDC.address),
    amount: '0',
    feeBasis: 0,
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256'],
      encodingVariables: ['assetId', 'feeBasis', 'amount'],
    },
    value: 0,
    safeOperation: 1,
  },
  ClearpoolSupply: {
    type: 'ClearpoolSupply',
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
  ClearpoolWithdraw: {
    type: 'ClearpoolWithdraw',
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
  UwULendWithdraw: {
    type: 'UwULendWithdraw',
    assetId: getBytes4(tokenConfig.uUSDT.address),
    amount: '0',
    feeBasis: 0,
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256'],
      encodingVariables: ['assetId', 'feeBasis', 'amount'],
    },
    value: 0,
    safeOperation: 1,
  },
  UwULendSupply: {
    type: 'UwULendSupply',
    assetId: getBytes4(tokenConfig.uUSDT.address),
    amount: '0',
    feeBasis: 0,
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256'],
      encodingVariables: ['assetId', 'feeBasis', 'amount'],
    },
    value: 0,
    safeOperation: 1,
  },
  BendDaoSupply: {
    type: 'BendDaoSupply',
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
  BendDaoWithdraw: {
    type: 'BendDaoWithdraw',
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
  SparkSupply: {
    type: 'SparkSupply',
    useSDK: false,
    value: 0,
    safeOperation: 1,
    poolAddress: tokenConfig.sDAI.address,
    feeBasis: 0,
    amount: '0',
    minSharesReceived: '0',
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256', 'uint256'],
      encodingVariables: ['poolId', 'feeBasis', 'amount', 'minSharesReceived'],
    },
  },
  SparkWithdraw: {
    type: 'SparkWithdraw',
    useSDK: false,
    value: 0,
    safeOperation: 1,
    poolAddress: tokenConfig.sDAI.address,
    feeBasis: 0,
    amount: '0',
    maxSharesBurned: ethers.MaxUint256.toString(),
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256', 'uint256'],
      encodingVariables: ['poolId', 'feeBasis', 'amount', 'maxSharesBurned'],
    },
  },
  AcrossSupply: {
    type: 'AcrossSupply',
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
  AcrossWithdraw: {
    type: 'AcrossWithdraw',
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
  MorphoSupply: {
    type: 'MorphoSupply',
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
  MorphoWithdraw: {
    type: 'MorphoWithdraw',
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
  YearnSupplyV3: {
    type: 'YearnSupplyV3',
    useSDK: false,
    value: 0,
    safeOperation: 1,
    poolAddress: tokenConfig.yearnV3_DAI.address,
    feeBasis: 0,
    amount: '0',
    minSharesReceived: '0',
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256', 'uint256'],
      encodingVariables: ['poolId', 'feeBasis', 'amount', 'minSharesReceived'],
    },
  },
  YearnWithdrawV3: {
    type: 'YearnWithdrawV3',
    useSDK: false,
    value: 0,
    safeOperation: 1,
    poolAddress: tokenConfig.yearnV3_DAI.address,
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
  GearboxPassiveSupply: {
    type: 'GearboxPassiveSupply',
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
  GearboxPassiveWithdraw: {
    type: 'GearboxPassiveWithdraw',
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
