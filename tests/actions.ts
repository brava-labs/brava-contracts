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
export const actionDefaults: Record<string, Partial<ActionArgs> & { encoding?: ActionEncoding }> = {
  FluidSupply: {
    useSDK: false,
    protocol: 'fluid',
    token: 'USDC',
    feePercentage: 0,
    minAmount: '0',
    value: 0,
    safeOperation: 1,
    amount: '0',
    minSharesReceived: '0',
    encoding: {
      inputParams: ['address', 'uint256', 'uint256', 'uint256'],
      encodingVariables: ['vaultAddress', 'amount', 'feePercentage', 'minSharesReceived'],
    },
  },
  FluidWithdraw: {
    useSDK: false,
    protocol: 'fluid',
    token: 'USDC',
    feePercentage: 0,
    minAmount: '0',
    value: 0,
    safeOperation: 1,
    amount: '0',
    maxSharesBurned: ethers.MaxUint256.toString(),
    encoding: {
      inputParams: ['address', 'uint256', 'uint256', 'uint256'],
      encodingVariables: ['vaultAddress', 'amount', 'feePercentage', 'maxSharesBurned'],
    },
  },
  YearnSupply: {
    useSDK: false,
    protocol: 'yearn',
    token: 'USDC',
    feePercentage: 0,
    minAmount: '0',
    value: 0,
    safeOperation: 1,
    amount: '0',
    minSharesReceived: '0',
    encoding: {
      inputParams: ['address', 'uint256', 'uint256', 'uint256'],
      encodingVariables: ['vaultAddress', 'amount', 'feePercentage', 'minSharesReceived'],
    },
  },
  YearnWithdraw: {
    useSDK: false,
    protocol: 'yearn',
    token: 'USDC',
    feePercentage: 0,
    minAmount: '0',
    value: 0,
    safeOperation: 1,
    amount: '0',
    maxSharesBurned: ethers.MaxUint256.toString(),
    encoding: {
      inputParams: ['address', 'uint256', 'uint256', 'uint256'],
      encodingVariables: ['vaultAddress', 'amount', 'feePercentage', 'maxSharesBurned'],
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
  amount?: BigInt | string;
  feePercentage?: number;
  minAmount?: string;
  signer?: Signer;
  inputParams?: string[];
  minSharesReceived?: string;
  maxSharesBurned?: string;
}
