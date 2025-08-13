/**
 * Shared utilities to prevent circular dependencies
 *
 * This file contains basic utilities that are used across multiple test files
 * without importing from other test modules.
 */

export const isLoggingEnabled = process.env.ENABLE_LOGGING === 'true';

export function log(...args: unknown[]): void {
  if (isLoggingEnabled) {
    console.log(...args);
  }
}

export function formatAmount(amount: bigint, decimals: number): string {
  return (amount / BigInt(10 ** decimals)).toString();
}

export function getBytes4(address: string): string {
  // Import ethers dynamically to avoid circular dependencies
  const ethers = require('hardhat').ethers;
  return ethers.keccak256(ethers.solidityPacked(['address'], [address])).slice(0, 10);
}
