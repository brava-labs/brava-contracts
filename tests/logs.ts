// This file contains the log definitions for the actions
// TODO: Add definiitions for the AdminVault logs
// Any new logs should have the following:
// - An entry in the ACTION_LOG_IDS enum
// - An interface to define how it extends the BaseLog
// - An entry in the LogDefinitions object
//     - The types array should contain the expected types in the order they appear in the log
//     - The decode function should take in the baseLog and the decodedBytes and return the log

export const ACTION_LOG_IDS = {
  BALANCE_UPDATE: 1,
  BUY_COVER: 2,
  CURVE_3POOL_SWAP: 3,
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
  poolId: string;
  balanceBefore: bigint;
  balanceAfter: bigint;
  feeInTokens: bigint;
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
    types: ['bytes4', 'uint256', 'uint256', 'uint256'],
    decode: (baseLog, decodedBytes): Curve3PoolSwapLog => ({
      ...baseLog,
      poolId: decodedBytes[0].toString(),
      balanceBefore: decodedBytes[1],
      balanceAfter: decodedBytes[2],
      feeInTokens: decodedBytes[3],
    }),
  },
};
