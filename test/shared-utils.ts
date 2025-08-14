/**
 * Shared utilities to prevent circular dependencies
 *
 * This file contains basic utilities that are used across multiple test files
 * without importing from other test modules.
 */

export const isLoggingEnabled = process.env.ENABLE_LOGGING === 'true';

export function log(...args: unknown[]): void {
  if (isLoggingEnabled) {
    // eslint-disable-next-line no-console
    console.log(...args);
  }
}

export function formatAmount(amount: bigint, decimals: number): string {
  return (amount / BigInt(10 ** decimals)).toString();
}

export function getBytes4(address: string): string {
  // Import ethers dynamically to avoid circular dependencies
  const ethers = require('hardhat').ethers;
  // Compute bytes4(keccak256(rawBytes)) without enforcing address type to allow test invalid values
  return ethers.keccak256(address).slice(0, 10);
}
