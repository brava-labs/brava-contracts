import { tokenConfig } from './constants';
import { ethers } from 'ethers';
import { CoverAsset } from '@nexusmutual/sdk';
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

// Specific interfaces for each action type
interface SupplyArgs extends BaseActionArgs {
  type: 'FluidSupply' | 'YearnSupply' | 'ClearpoolSupply';
  poolAddress?: string;
  feeBasis?: number;
  amount?: string | BigInt;
  minSharesReceived?: string;
}

interface WithdrawArgs extends BaseActionArgs {
  type: 'FluidWithdraw' | 'YearnWithdraw' | 'ClearpoolWithdraw';
  poolAddress?: string;
  feeBasis?: number;
  amount?: string | BigInt;
  maxSharesBurned?: string;
}

interface SwapArgs extends BaseActionArgs {
  type: 'Curve3PoolSwap';
  tokenIn: keyof typeof tokenConfig;
  tokenOut: keyof typeof tokenConfig;
  amount: string | BigInt;
  minAmount?: string;
}

interface TokenTransferArgs extends BaseActionArgs {
  type: 'PullToken' | 'SendToken';
  token: keyof typeof tokenConfig;
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

export interface AaveLikeArgs extends BaseActionArgs {
  type: 'AaveV3Supply' | 'AaveV3Withdraw' | 'AaveV2Supply' | 'AaveV2Withdraw';
  assetId: string;
  amount: string;
  feeBasis?: number;
}

export interface AaveV2Args extends BaseActionArgs {
  type: 'AaveV2Supply' | 'AaveV2Withdraw';
  assetId: string;
  amount: string;
  feeBasis?: number;
}

// Union type for all action args
export type ActionArgs =
  | SupplyArgs
  | WithdrawArgs
  | SwapArgs
  | TokenTransferArgs
  | BuyCoverArgs
  | AaveLikeArgs;

/// @dev this is the default values for each action type
export const actionDefaults: Record<string, ActionArgs> = {
  FluidSupply: {
    type: 'FluidSupply',
    useSDK: false,
    value: 0,
    safeOperation: 1,
    poolAddress: tokenConfig.USDC.pools.fluid, // Default to USDC Fluid pool
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
    poolAddress: tokenConfig.USDC.pools.fluid, // Default to USDC Fluid pool
    feeBasis: 0,
    amount: '0',
    maxSharesBurned: ethers.MaxUint256.toString(),
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256', 'uint256'],
      encodingVariables: ['poolId', 'feeBasis', 'amount', 'maxSharesBurned'],
    },
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
    amount: '0',
    maxSharesBurned: ethers.MaxUint256.toString(),
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256', 'uint256'],
      encodingVariables: ['poolId', 'feeBasis', 'amount', 'maxSharesBurned'],
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
    assetId: getBytes4(tokenConfig.aUSDC_V3.address),
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
    assetId: getBytes4(tokenConfig.aUSDC_V3.address),
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
    assetId: getBytes4(tokenConfig.aUSDC_V2.address),
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
    assetId: getBytes4(tokenConfig.aUSDC_V2.address),
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
    useSDK: false,
    type: 'ClearpoolSupply',
    poolAddress: tokenConfig.cpALP_USDC.address,
    feeBasis: 0,
    amount: '0',
    minSharesReceived: '0',
    value: 0,
    safeOperation: 1,
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256', 'uint256'],
      encodingVariables: ['poolId', 'feeBasis', 'amount', 'minSharesReceived'],
    },
    sdkArgs: ['poolAddress', 'amount', 'minSharesReceived', 'feeBasis'],
  },
  ClearpoolWithdraw: {
    type: 'ClearpoolWithdraw',
    useSDK: false,
    poolAddress: tokenConfig.cpALP_USDC.address,
    feeBasis: 0,
    amount: '0',
    maxSharesBurned: ethers.MaxUint256.toString(),
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256', 'uint256'],
      encodingVariables: ['poolId', 'feeBasis', 'amount', 'maxSharesBurned'],
    },
    value: 0,
    safeOperation: 1,
  },
};
