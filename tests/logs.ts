// This file contains the log definitions for the actions
// TODO: Add definiitions for the AdminVault logs
// Any new logs should have the following:
// - An entry in the ACTION_LOG_IDS enum
// - An interface to define how it extends the BaseLog
// - An entry in the LogDefinitions object
//     - The types array should contain the expected types in the order they appear in the log
//     - The decode function should take in the baseLog and the decodedBytes and return the log

export const LOGGER_INTERFACE = [
  'event ActionEvent(address caller, uint8 logId, bytes data)',
  'event AdminVaultEvent(string logName, bytes data)',
];

export const ACTION_LOG_IDS = {
  BALANCE_UPDATE: 1,
  BUY_COVER: 2,
  CURVE_3POOL_SWAP: 3,
  SEND_TOKEN: 4,
  PULL_TOKEN: 5,
  PARASWAP_SWAP: 6,
  // Add more log IDs as needed
};

export interface BaseLog {
  eventId: number;
  safeAddress: string;
}

export interface BalanceUpdateLog extends BaseLog {
  strategyId: number;
  poolId: string;
  balanceBefore: bigint;
  balanceAfter: bigint;
  feeInTokens: bigint;
}

export interface BuyCoverLog extends BaseLog {
  strategyId: number;
  period: string;
  amount: string;
  coverId: string;
}

export interface Curve3PoolSwapLog extends BaseLog {
  fromToken: bigint;
  toToken: bigint;
  amountIn: bigint;
  minAmountOut: bigint;
  actualAmountOut: bigint;
}

export interface SendTokenLog extends BaseLog {
  tokenAddr: string;
  to: string;
  amount: string;
}

export interface PullTokenLog extends BaseLog {
  tokenAddr: string;
  from: string;
  amount: string;
}

export interface ParaswapSwapLog extends BaseLog {
  tokenIn: string;
  tokenOut: string;
  fromAmount: bigint;
  minToAmount: bigint;
  amountReceived: bigint;
}

type LogDecoder<T extends BaseLog> = (baseLog: BaseLog, decodedBytes: any[]) => T;

interface LogDefinition<T extends BaseLog> {
  types: string[];
  decode: LogDecoder<T>;
}

export const LogDefinitions: { [key: number]: LogDefinition<any> } = {
  [ACTION_LOG_IDS.BALANCE_UPDATE]: {
    types: ['uint16', 'bytes4', 'uint256', 'uint256', 'uint256'],
    decode: (baseLog, decodedBytes): BalanceUpdateLog => ({
      ...baseLog,
      strategyId: decodedBytes[0],
      poolId: decodedBytes[1].toString(),
      balanceBefore: decodedBytes[2],
      balanceAfter: decodedBytes[3],
      feeInTokens: decodedBytes[4],
    }),
  },
  [ACTION_LOG_IDS.BUY_COVER]: {
    types: ['uint16', 'uint32', 'uint256', 'uint256'],
    decode: (baseLog, decodedBytes): BuyCoverLog => ({
      ...baseLog,
      strategyId: decodedBytes[0],
      period: decodedBytes[1].toString(),
      amount: decodedBytes[2].toString(),
      coverId: decodedBytes[3].toString(),
    }),
  },
  [ACTION_LOG_IDS.CURVE_3POOL_SWAP]: {
    types: ['int256', 'int256', 'uint256', 'uint256', 'uint256'],
    decode: (baseLog, decodedBytes): Curve3PoolSwapLog => ({
      ...baseLog,
      fromToken: decodedBytes[0],
      toToken: decodedBytes[1],
      amountIn: decodedBytes[2],
      minAmountOut: decodedBytes[3],
      actualAmountOut: decodedBytes[4],
    }),
  },
  [ACTION_LOG_IDS.SEND_TOKEN]: {
    types: ['address', 'address', 'uint256'],
    decode: (baseLog, decodedBytes): SendTokenLog => ({
      ...baseLog,
      tokenAddr: decodedBytes[0].toString(),
      to: decodedBytes[1].toString(),
      amount: decodedBytes[2].toString(),
    }),
  },
  [ACTION_LOG_IDS.PULL_TOKEN]: {
    types: ['address', 'address', 'uint256'],
    decode: (baseLog, decodedBytes): PullTokenLog => ({
      ...baseLog,
      tokenAddr: decodedBytes[0].toString(),
      from: decodedBytes[1].toString(),
      amount: decodedBytes[2].toString(),
    }),
  },
  [ACTION_LOG_IDS.PARASWAP_SWAP]: {
    types: ['address', 'address', 'uint256', 'uint256', 'uint256'],
    decode: (baseLog, decodedBytes): ParaswapSwapLog => ({
      ...baseLog,
      tokenIn: decodedBytes[0].toString(),
      tokenOut: decodedBytes[1].toString(),
      fromAmount: decodedBytes[2],
      minToAmount: decodedBytes[3],
      amountReceived: decodedBytes[4],
    }),
  },
};
