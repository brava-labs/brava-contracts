import { tokenConfig } from './constants';
import { ethers } from 'ethers';
export const actionTypes = {
  DEPOSIT_ACTION: 0,
  WITHDRAW_ACTION: 1,
  SWAP_ACTION: 2,
  COVER_ACTION: 3,
  FEE_ACTION: 4,
  TRANSFER_ACTION: 5,
  CUSTOM_ACTION: 6,
};

// Define default values for each action type
export interface ActionEncoding {
  inputParams: string[];
  encodingVariables: string[];
}

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
    minAmount: '0',
    amount: '0',
    maxSharesBurned: ethers.MaxUint256.toString(),
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256', 'uint256'],
      encodingVariables: ['poolId', 'feeBasis', 'amount', 'maxSharesBurned'],
    },
  },
  Curve3PoolSwap: {
    type: 'Curve3PoolSwap',
    useSDK: true,
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
  // Add more action types and their defaults as needed
};

import { Signer } from 'ethers';

// We only need to know the type, everything else could be set to default values
export interface ActionArgs {
  useSDK?: boolean;
  protocol?: 'fluid' | 'yearn';
  type: string;
  safeAddress?: string;
  value?: number;
  actionAddress?: string;
  safeOperation?: number;
  token?: keyof typeof tokenConfig;
  tokenIn?: keyof typeof tokenConfig;
  tokenOut?: keyof typeof tokenConfig;
  amount?: BigInt | string;
  feeBasis?: number;
  minAmount?: string;
  signer?: Signer;
  inputParams?: string[];
  minSharesReceived?: string;
  maxSharesBurned?: string;
  encoding?: ActionEncoding;
  poolId?: string;
  poolAddress?: string;
  tokenAddress?: string;
  from?: string;
  to?: string;
}
