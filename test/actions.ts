import { CoverAsset } from '@nexusmutual/sdk';
import { ethers } from 'hardhat';
import { tokenConfig } from './constants';
import { getBytes4 } from './shared-utils';
import { ParaswapSwapParams } from './params';

export const actionTypes = {
  DEPOSIT_ACTION: 0,
  WITHDRAW_ACTION: 1,
  SWAP_ACTION: 2,
  COVER_ACTION: 3,
  FEE_ACTION: 4,
  TRANSFER_ACTION: 5,
  CUSTOM_ACTION: 6,
  BRIDGE_ACTION: 12, // CCTP cross-chain bridging
};

// Protocol name mappings for TypedData structures
export const protocolNames = {
  // Core protocols
  FluidV1: 'FluidV1',
  YearnV2: 'YearnV2',
  YearnV3: 'YearnV3',
  VesperV1: 'VesperV1',
  ClearpoolV1: 'ClearpoolV1',
  SparkV1: 'SparkV1',
  AcrossV3: 'AcrossV3',
  MorphoV1: 'MorphoV1',
  NotionalV3: 'NotionalV3',
  GearboxPassiveV3: 'GearboxPassiveV3',
  EulerV2: 'EulerV2',
  CurveSavings: 'CurveSavings',
  MapleV1: 'MapleV1',
  AaveV2: 'AaveV2',
  AaveV3: 'AaveV3',
  StrikeV1: 'StrikeV1',
  UwULendV1: 'UwULendV1',
  BendDaoV1: 'BendDaoV1',

  // Special protocols
  Curve: 'Curve',
  Paraswap: 'Paraswap',
  ZeroEx: 'ZeroEx',
  NexusMutual: 'NexusMutual',
  Brava: 'Brava', // For internal actions like PullToken, SendToken
  CCTP: 'CCTP_V2', // For CCTP cross-chain bridging
} as const;

// Action type mapping for TypedData
export function getActionTypeForProtocolAction(actionName: string): number {
  if (actionName.includes('Supply') || actionName.includes('Deposit')) {
    return actionTypes.DEPOSIT_ACTION;
  }
  if (actionName.includes('Withdraw')) {
    return actionTypes.WITHDRAW_ACTION;
  }
  if (actionName.includes('Swap')) {
    return actionTypes.SWAP_ACTION;
  }
  if (actionName.includes('Cover')) {
    return actionTypes.COVER_ACTION;
  }
  if (actionName.includes('PullToken') || actionName.includes('SendToken')) {
    return actionTypes.TRANSFER_ACTION;
  }
  if (actionName.includes('CCTP') || actionName === 'CCTPBridgeSend') {
    return actionTypes.BRIDGE_ACTION;
  }
  return actionTypes.CUSTOM_ACTION;
}

// Protocol name extraction from action name
export function getProtocolNameForAction(actionName: string): string {
  // Handle special cases first
  if (actionName.includes('PullToken') || actionName.includes('SendToken')) {
    return protocolNames.Brava;
  }
  if (actionName.includes('CCTP') || actionName === 'CCTPBridgeSend') {
    return protocolNames.CCTP;
  }
  if (actionName.includes('Curve')) {
    return protocolNames.Curve;
  }
  if (actionName.includes('Paraswap')) {
    return protocolNames.Paraswap;
  }
  if (actionName.includes('BuyCover')) {
    return protocolNames.NexusMutual;
  }

  // Extract protocol from action name (e.g., "FluidV1Supply" -> "FluidV1")
  const protocolMatch = actionName.match(/^([A-Za-z0-9]+)[A-Z]/);
  if (protocolMatch) {
    const protocolKey = protocolMatch[1];
    const protocolNameKey = protocolKey as keyof typeof protocolNames;
    if (protocolNames[protocolNameKey]) {
      return protocolNames[protocolNameKey];
    }
  }

  // Fallback
  return protocolNames.Brava;
}

// Base interface for common properties
interface BaseActionArgs {
  useSDK?: boolean;
  value?: number;
  safeOperation?: number;
  safeAddress?: string;
  signer?: any; // ethers.Signer type from hardhat
  encoding?: {
    inputParams: string[];
    encodingVariables: string[];
  };
  sdkArgs?: string[];
  safeTxGas?: number;
  gasPrice?: number;
  baseGas?: number;
  debug?: boolean;
  // TypedData properties (auto-generated but can be overridden)
  protocolName?: string;
  actionType?: number;
}

// Share-based withdraw specific args
interface ShareBasedWithdrawArgs extends BaseActionArgs {
  poolAddress?: string;
  feeBasis?: number;
  sharesToBurn?: string | bigint;
  minUnderlyingReceived?: string | bigint;
}

// Standard ERC4626 withdraw args
interface ERC4626WithdrawArgs extends BaseActionArgs {
  poolAddress?: string;
  feeBasis?: number;
  amount?: string | bigint;
  maxSharesBurned?: string | bigint;
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
        | 'GearboxPassiveV3Withdraw'
        | 'EulerV2Withdraw'
        | 'CurveSavingsWithdraw';
    })
  | (ShareBasedWithdrawArgs & {
      type: 'MapleWithdrawQueue' | 'NotionalV3Withdraw' | 'YearnV2Withdraw' | 'VesperV1Withdraw';
    });

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
    | 'GearboxPassiveV3Supply'
    | 'EulerV2Supply'
    | 'CurveSavingsSupply'
    | 'MapleSupply';
  poolAddress?: string;
  feeBasis?: number;
  amount?: string | bigint;
  minSharesReceived?: string | bigint;
}

interface SwapArgs extends BaseActionArgs {
  type: 'Curve3PoolSwap';
  tokenIn: keyof typeof tokenConfig;
  tokenOut: keyof typeof tokenConfig;
  amount: string | bigint;
  minAmount?: string;
}

interface ParaswapSwapArgs extends BaseActionArgs {
  type: 'ParaswapSwap';
  tokenIn: keyof typeof tokenConfig;
  tokenOut: keyof typeof tokenConfig;
  fromAmount: string | bigint;
  minToAmount: string;
  swapCallData?: string;
  tokenInAddress?: string;
  tokenOutAddress?: string;
}

interface ZeroExSwapArgs extends BaseActionArgs {
  type: 'ZeroExSwap';
  tokenIn: string;
  tokenOut: string;
  fromAmount: string | bigint;
  minToAmount: string;
  swapTarget: string;
  swapCallData: string;
}

interface TokenTransferArgs extends BaseActionArgs {
  type: 'PullToken' | 'SendToken';
  token?: keyof typeof tokenConfig;
  tokenAddress?: string;
  amount: string | bigint;
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
  amount: string | bigint;
  feeBasis?: number;
}

export interface AaveV2Args extends BaseActionArgs {
  type: 'AaveV2Supply' | 'AaveV2Withdraw';
  assetId: string;
  amount: string | bigint;
  feeBasis?: number;
}

interface StrikeArgs extends BaseActionArgs {
  type: 'StrikeV1Supply' | 'StrikeV1Withdraw';
  assetId: string;
  amount: string | bigint;
  feeBasis?: number;
}

export interface UwULendV1Args extends BaseActionArgs {
  type: 'UwULendV1Supply' | 'UwULendV1Withdraw';
  assetId: string;
  amount: string | bigint;
  feeBasis?: number;
}

export interface BendDaoV1Args extends BaseActionArgs {
  type: 'BendDaoV1Supply' | 'BendDaoV1Withdraw';
  assetId?: string;
  amount?: string | bigint;
  feeBasis?: number;
}

interface UpgradeArgs extends BaseActionArgs {
  type: 'UpgradeAction';
  data: string;
}

export interface ClearpoolV1Args extends BaseActionArgs {
  poolAddress: string;
  amount: string | bigint;
  feeBasis?: number;
  minSharesReceived?: string | bigint;
  maxSharesBurned?: string | bigint;
}

export interface CCTPBridgeSendArgs extends BaseActionArgs {
  type: 'CCTPBridgeSend';
  usdcToken: string;
  amount: string | bigint;
  destinationDomain: number;
  destinationCaller: string;
  maxFee: number;
  minFinalityThreshold: number;
  cctpParams?: any; // For encoding
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
  | ZeroExSwapArgs
  | TokenTransferArgs
  | BuyCoverArgs
  | StrikeArgs
  | UwULendV1Args
  | UpgradeArgs
  | CCTPBridgeSendArgs;

// Default pool addresses for test cases
const defaultPools: Record<string, string> = {
  // ERC4626 style protocols (using poolAddress)
  FluidV1Supply: tokenConfig.FLUID_V1_USDC.address,
  FluidV1Withdraw: tokenConfig.FLUID_V1_USDC.address,
  YearnV2Supply: tokenConfig.YEARN_V2_USDC.address,
  YearnV2Withdraw: tokenConfig.YEARN_V2_USDC.address,
  VesperV1Supply: tokenConfig.VESPER_V1_USDC.address,
  VesperV1Withdraw: tokenConfig.VESPER_V1_USDC.address,
  ClearpoolV1Supply: tokenConfig.CLEARPOOL_V1_ALP_USDC.address,
  ClearpoolV1Withdraw: tokenConfig.CLEARPOOL_V1_ALP_USDC.address,
  SparkV1Supply: tokenConfig.SPARK_V1_DAI.address,
  SparkV1Withdraw: tokenConfig.SPARK_V1_DAI.address,
  AcrossV3Supply: tokenConfig.ACROSS_V3_lpUSDC.address,
  AcrossV3Withdraw: tokenConfig.ACROSS_V3_lpUSDC.address,
  MorphoV1Supply: tokenConfig.MORPHO_V1_fxUSDC.address,
  MorphoV1Withdraw: tokenConfig.MORPHO_V1_fxUSDC.address,
  YearnV3Supply: tokenConfig.YEARN_V3_DAI.address,
  YearnV3Withdraw: tokenConfig.YEARN_V3_DAI.address,
  NotionalV3Supply: tokenConfig.NOTIONAL_V3_USDC.address,
  NotionalV3Withdraw: tokenConfig.NOTIONAL_V3_USDC.address,
  GearboxPassiveV3Supply: tokenConfig.GEARBOX_PASSIVE_V3_USDC.address,
  GearboxPassiveV3Withdraw: tokenConfig.GEARBOX_PASSIVE_V3_USDC.address,
  EulerV2Supply: tokenConfig.EULER_V2_PRIME_USDC.address,
  EulerV2Withdraw: tokenConfig.EULER_V2_PRIME_USDC.address,
  CurveSavingsSupply: tokenConfig.CURVE_SAVINGS_scrvUSD.address,
  CurveSavingsWithdraw: tokenConfig.CURVE_SAVINGS_scrvUSD.address,
  MapleSupply: '', // To be set in test
  MapleWithdrawQueue: '', // To be set in test

  // Asset-based protocols (using assetId)
  AaveV3Supply: getBytes4(tokenConfig.AAVE_V3_aUSDC.address),
  AaveV3Withdraw: getBytes4(tokenConfig.AAVE_V3_aUSDC.address),
  AaveV2Supply: getBytes4(tokenConfig.AAVE_V2_aUSDC.address),
  AaveV2Withdraw: getBytes4(tokenConfig.AAVE_V2_aUSDC.address),
  StrikeV1Supply: getBytes4(tokenConfig.STRIKE_V1_USDC.address),
  StrikeV1Withdraw: getBytes4(tokenConfig.STRIKE_V1_USDC.address),
  UwULendV1Supply: getBytes4(tokenConfig.UWU_V1_USDT.address),
  UwULendV1Withdraw: getBytes4(tokenConfig.UWU_V1_USDT.address),
  BendDaoV1Supply: getBytes4(tokenConfig.BEND_V1_USDT.address),
  BendDaoV1Withdraw: getBytes4(tokenConfig.BEND_V1_USDT.address),
};

// Base configurations for different action types
const baseDefaults = {
  // Common defaults for all actions
  common: {
    useSDK: false,
    value: 0,
    safeOperation: 1,
    feeBasis: 0,
  },

  // Supply/Deposit action base config
  supply: {
    amount: '0',
    minSharesReceived: '0',
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256', 'uint256'],
      encodingVariables: ['poolId', 'feeBasis', 'amount', 'minSharesReceived'],
    },
  },

  // ERC4626 style withdraw base config
  withdrawERC4626: {
    amount: '0',
    maxSharesBurned: ethers.MaxUint256.toString(),
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256', 'uint256'],
      encodingVariables: ['poolId', 'feeBasis', 'amount', 'maxSharesBurned'],
    },
  },

  // Share-based withdraw base config
  withdrawShareBased: {
    sharesToBurn: '0',
    minUnderlyingReceived: '0',
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256', 'uint256'],
      encodingVariables: ['poolId', 'feeBasis', 'sharesToBurn', 'minUnderlyingReceived'],
    },
  },

  // Asset-based action config (for Aave-like protocols)
  assetAction: {
    amount: '0',
    feeBasis: 0,
    encoding: {
      inputParams: ['bytes4', 'uint16', 'uint256'],
      encodingVariables: ['assetId', 'feeBasis', 'amount'],
    },
  },

  // Token transfer base config
  transfer: {
    amount: '0',
  },

  // Swap base config
  swap: {
    tokenIn: 'USDC',
    tokenOut: 'USDT',
  },
};

// Special cases that don't follow the standard protocol pattern
const specialCases = {
  CCTPBridgeSend: {
    type: 'CCTPBridgeSend',
    ...baseDefaults.common,
    usdcToken: tokenConfig.USDC.address,
    amount: '100000', // 0.1 USDC in 6 decimals (from working example)
    destinationDomain: 6, // Base (from working example)
    destinationCaller: '0xc3cd4f2e31f9b4c64fc54bc5e20281ec7e869941', // Exact destinationCaller from working example
    maxFee: 0, // 0 fee (from working example)
    minFinalityThreshold: 2000,
    encoding: {
      inputParams: ['tuple(address,uint256,uint32,bytes32,uint256,uint32)'],
      encodingVariables: ['cctpParams'],
    },
  },
  Curve3PoolSwap: {
    type: 'Curve3PoolSwap',
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
      encodingVariables: [
        'tokenInAddress',
        'tokenOutAddress',
        'fromAmount',
        'minToAmount',
        'swapCallData',
      ],
    },
  },
  ZeroExSwap: {
    type: 'ZeroExSwap',
    useSDK: false,
    value: 0,
    safeOperation: 1,
    tokenIn: '',
    tokenOut: '',
    fromAmount: '0',
    minToAmount: '1',
    swapTarget: '',
    swapCallData: '0x',
    encoding: {
      inputParams: ['tuple(address,address,uint256,uint256,uint256,address,bytes)'],
      encodingVariables: ['swapParams'],
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
  UpgradeAction: {
    type: 'UpgradeAction',
    useSDK: false,
    data: '0x',
    encoding: {
      inputParams: ['bytes'],
      encodingVariables: ['data'],
    },
  },
};

// Action type categorization for building standard defaults
const actionCategories = {
  // Standard ERC4626 supply actions
  supply: [
    'FluidV1Supply',
    'YearnV2Supply',
    'VesperV1Supply',
    'ClearpoolV1Supply',
    'SparkV1Supply',
    'AcrossV3Supply',
    'MorphoV1Supply',
    'YearnV3Supply',
    'NotionalV3Supply',
    'GearboxPassiveV3Supply',
    'EulerV2Supply',
    'CurveSavingsSupply',
    'MapleSupply',
  ],

  // ERC4626-style withdraw actions
  withdrawERC4626: [
    'FluidV1Withdraw',
    'ClearpoolV1Withdraw',
    'SparkV1Withdraw',
    'AcrossV3Withdraw',
    'MorphoV1Withdraw',
    'YearnV3Withdraw',
    'GearboxPassiveV3Withdraw',
    'EulerV2Withdraw',
    'CurveSavingsWithdraw',
  ],

  // Share-based withdraw actions
  withdrawShareBased: [
    'MapleWithdrawQueue',
    'NotionalV3Withdraw',
    'YearnV2Withdraw',
    'VesperV1Withdraw',
  ],

  // Asset-based actions (for protocols like Aave that use assetId)
  assetAction: [
    'AaveV3Supply',
    'AaveV3Withdraw',
    'AaveV2Supply',
    'AaveV2Withdraw',
    'StrikeV1Supply',
    'StrikeV1Withdraw',
    'UwULendV1Supply',
    'UwULendV1Withdraw',
    'BendDaoV1Supply',
    'BendDaoV1Withdraw',
  ],
};

// Function to create the full actionDefaults object
function buildActionDefaults() {
  const actionDefaults: Record<string, ActionArgs> = {};

  // Build supply-type actions
  actionCategories.supply.forEach((actionType) => {
    const defaultConfig: any = {
      type: actionType,
      ...baseDefaults.common,
      ...baseDefaults.supply,
    };

    // Add default pool address if available
    if (defaultPools[actionType]) {
      defaultConfig.poolAddress = defaultPools[actionType];
    }

    actionDefaults[actionType] = defaultConfig as ActionArgs;
  });

  // Build ERC4626-style withdraw actions
  actionCategories.withdrawERC4626.forEach((actionType) => {
    const defaultConfig: any = {
      type: actionType,
      ...baseDefaults.common,
      ...baseDefaults.withdrawERC4626,
    };

    // Add default pool address if available
    if (defaultPools[actionType]) {
      defaultConfig.poolAddress = defaultPools[actionType];
    }

    actionDefaults[actionType] = defaultConfig as ActionArgs;
  });

  // Build share-based withdraw actions
  actionCategories.withdrawShareBased.forEach((actionType) => {
    const defaultConfig: any = {
      type: actionType,
      ...baseDefaults.common,
      ...baseDefaults.withdrawShareBased,
    };

    // Add default pool address if available
    if (defaultPools[actionType]) {
      defaultConfig.poolAddress = defaultPools[actionType];
    }

    actionDefaults[actionType] = defaultConfig as ActionArgs;
  });

  // Build asset-based actions
  actionCategories.assetAction.forEach((actionType) => {
    const defaultConfig: any = {
      type: actionType,
      ...baseDefaults.common,
      ...baseDefaults.assetAction,
    };

    // Add default assetId if available
    if (defaultPools[actionType]) {
      defaultConfig.assetId = defaultPools[actionType];
    }

    actionDefaults[actionType] = defaultConfig as ActionArgs;
  });

  // Add special cases
  Object.entries(specialCases).forEach(([key, config]) => {
    actionDefaults[key] = config as ActionArgs;
  });

  return actionDefaults;
}

/// @dev this is the default values for each action type
export const actionDefaults = buildActionDefaults();
