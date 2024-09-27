export interface BalanceUpdateLog {
  eventName: string | null;
  safeAddress: string;
  strategyId: number;
  poolId: string;
  balanceBefore: bigint;
  balanceAfter: bigint;
  feeInTokens: bigint;
}
export interface BuyCoverLog {
  eventName: string | null;
  safeAddress: string;
  strategyId: number;
  poolId: string;
  coverId: string;
}
