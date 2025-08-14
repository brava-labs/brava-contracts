/**
 * ZeroExCache - A utility for caching 0x API responses for testing
 *
 * This file automatically fetches real quotes from 0x API when not in cache,
 * and caches them for future use. Tests become self-sufficient.
 */

import { BigNumberish } from 'ethers';
import { log } from '../../utils';

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Path to the cache file
const CACHE_FILE_PATH = path.join(__dirname, 'zeroExCache.json');

// Type definition for cached 0x swap data
export interface CachedZeroExData {
  timestamp: number;
  blockNumber?: number;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  minBuyAmount: string;
  swapTarget: string;
  swapCallData: string;
  buyAmount: string;
  gasPrice: string;
  gas: string;
  value: string;
  allowanceTarget: string;
  spender?: string;
  chainId: number;
}

// Type for the entire cache
interface ZeroExCache {
  version: string;
  lastUpdated: number;
  cachedSwaps: CachedZeroExData[];
}

/**
 * Initialize the cache file if it doesn't exist
 */
function initCacheIfNeeded(): ZeroExCache {
  if (!fs.existsSync(CACHE_FILE_PATH)) {
    const initialCache: ZeroExCache = {
      version: '1.0',
      lastUpdated: Date.now(),
      cachedSwaps: [],
    };
    fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(initialCache, null, 2));
    return initialCache;
  }

  try {
    const cacheContent = fs.readFileSync(CACHE_FILE_PATH, 'utf8');
    return JSON.parse(cacheContent) as ZeroExCache;
  } catch (error) {
    log('Error reading 0x cache file, creating new one:', error);
    const initialCache: ZeroExCache = {
      version: '1.0',
      lastUpdated: Date.now(),
      cachedSwaps: [],
    };
    fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(initialCache, null, 2));
    return initialCache;
  }
}

/**
 * Save 0x swap data to cache
 */
export function saveZeroExToCache(data: CachedZeroExData): void {
  const cache = initCacheIfNeeded();

  // Normalize addresses to lowercase for consistent cache hits
  const normalizedData = {
    ...data,
    sellToken: data.sellToken.toLowerCase(),
    buyToken: data.buyToken.toLowerCase(),
    swapTarget: data.swapTarget.toLowerCase(),
    allowanceTarget: data.allowanceTarget.toLowerCase(),
  };

  // Check if we already have this exact swap in the cache
  const existingIndex = cache.cachedSwaps.findIndex(
    (swap) =>
      swap.sellToken.toLowerCase() === normalizedData.sellToken &&
      swap.buyToken.toLowerCase() === normalizedData.buyToken &&
      swap.sellAmount === normalizedData.sellAmount &&
      swap.chainId === normalizedData.chainId
  );

  if (existingIndex >= 0) {
    // Update existing entry
    cache.cachedSwaps[existingIndex] = normalizedData;
    log(
      `Updated existing 0x cache entry for ${normalizedData.sellToken} -> ${normalizedData.buyToken}`
    );
  } else {
    // Add new entry
    cache.cachedSwaps.push(normalizedData);
    log(`Added new 0x cache entry for ${normalizedData.sellToken} -> ${normalizedData.buyToken}`);
  }

  cache.lastUpdated = Date.now();
  fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(cache, null, 2));
}

/**
 * Get swap data from cache (with block number tolerance)
 */
export function getZeroExFromCache(
  sellToken: string,
  buyToken: string,
  sellAmount: string,
  chainId: number,
  currentBlockNumber?: number
): CachedZeroExData | null {
  const cache = initCacheIfNeeded();
  const blockTolerance = 100; // Allow cached data within 100 blocks

  const cachedData = cache.cachedSwaps.find((swap) => {
    const tokenMatch =
      swap.sellToken.toLowerCase() === sellToken.toLowerCase() &&
      swap.buyToken.toLowerCase() === buyToken.toLowerCase() &&
      swap.sellAmount === sellAmount &&
      swap.chainId === chainId;

    if (!tokenMatch) {
      return false;
    }

    // If no current block number provided, just match on tokens/amount
    if (!currentBlockNumber || !swap.blockNumber) {
      return true;
    }

    // Check if cached data is within block tolerance
    const blockDiff = Math.abs(currentBlockNumber - swap.blockNumber);
    return blockDiff <= blockTolerance;
  });

  if (cachedData) {
    log(`Found cached 0x data for ${sellToken} -> ${buyToken} (block ${cachedData.blockNumber})`);
    return cachedData;
  }

  return null;
}

/**
 * Get current block number from network
 */
export async function getCurrentBlockNumber(): Promise<number> {
  try {
    const { ethers } = require('hardhat');
    return await ethers.provider.getBlockNumber();
  } catch (error) {
    log('Error getting block number:', error);
    return 0;
  }
}

/**
 * Get 0x swap data (from cache or API)
 * Automatically fetches from API if not in cache and caches the result
 */
export async function getZeroExSwapData(
  sellToken: string,
  buyToken: string,
  sellAmount: BigNumberish,
  taker: string,
  chainId: number = 1
): Promise<{
  swapTarget: string;
  swapCallData: string;
  minBuyAmount: string;
  buyAmount: string;
  gasPrice: string;
  gas: string;
  value: string;
  allowanceTarget: string;
}> {
  const sellAmountStr = sellAmount.toString();
  const currentBlockNumber = await getCurrentBlockNumber();

  // Try to get from cache first (with block tolerance)
  const cachedData = getZeroExFromCache(
    sellToken,
    buyToken,
    sellAmountStr,
    chainId,
    currentBlockNumber
  );
  if (cachedData) {
    return {
      swapTarget: cachedData.swapTarget,
      swapCallData: cachedData.swapCallData,
      minBuyAmount: cachedData.minBuyAmount,
      buyAmount: cachedData.buyAmount,
      gasPrice: cachedData.gasPrice,
      gas: cachedData.gas,
      value: cachedData.value,
      allowanceTarget: cachedData.allowanceTarget,
    };
  }

  // Not in cache, fetch from API
  log(`Fetching fresh 0x quote for ${sellToken} -> ${buyToken} (amount: ${sellAmountStr})`);

  const apiKey = process.env.ZERO_EX_API_KEY;
  if (!apiKey) {
    throw new Error('ZERO_EX_API_KEY environment variable is required for fresh quotes');
  }

  try {
    const url =
      `https://api.0x.org/swap/allowance-holder/quote` +
      `?sellAmount=${sellAmountStr}` +
      `&taker=${taker}` +
      `&chainId=${chainId}` +
      `&sellToken=${sellToken}` +
      `&buyToken=${buyToken}` +
      `&slippageBps=100`; // 1% slippage tolerance

    log(`🌐 Calling 0x API: ${url}`);

    const response = await axios.get(url, {
      headers: {
        '0x-api-key': apiKey,
        '0x-version': 'v2',
      },
    });

    const data = response.data;

    if (!data.transaction) {
      throw new Error('Invalid 0x API response: missing transaction data');
    }

    log(`✅ 0x API response received: ${data.buyAmount} buyAmount`);
    log(`🔍 Full API response:`, JSON.stringify(data, null, 2));
    log(
      `🔍 Key fields: spender=${data.spender}, allowanceTarget=${data.allowanceTarget}, swapTarget=${data.transaction?.to}`
    );

    // Cache the fresh data
    const cacheData: CachedZeroExData = {
      timestamp: Date.now(),
      blockNumber: currentBlockNumber,
      sellToken: sellToken.toLowerCase(),
      buyToken: buyToken.toLowerCase(),
      sellAmount: sellAmountStr,
      minBuyAmount: data.minBuyAmount || '0',
      swapTarget: data.transaction.to,
      swapCallData: data.transaction.data,
      buyAmount: data.buyAmount || '0',
      gasPrice: data.transaction.gasPrice || '0',
      gas: data.transaction.gas || '0',
      value: data.transaction.value || '0',
      allowanceTarget: data.allowanceTarget || data.transaction.to,
      spender: data.spender,
      chainId,
    };

    saveZeroExToCache(cacheData);
    log(`💾 Successfully fetched and cached 0x data for ${sellToken} -> ${buyToken}`);

    return {
      swapTarget: cacheData.swapTarget,
      swapCallData: cacheData.swapCallData,
      minBuyAmount: cacheData.minBuyAmount,
      buyAmount: cacheData.buyAmount,
      gasPrice: cacheData.gasPrice,
      gas: cacheData.gas,
      value: cacheData.value,
      allowanceTarget: cacheData.allowanceTarget,
    };
  } catch (error: any) {
    log('❌ Error fetching 0x quote:', error.message);
    throw new Error(`Failed to fetch 0x quote: ${error.message}`);
  }
}

/**
 * Clear the cache
 */
export function clearZeroExCache(): void {
  if (fs.existsSync(CACHE_FILE_PATH)) {
    fs.unlinkSync(CACHE_FILE_PATH);
    log('0x cache cleared');
  }
}

/**
 * Get cache stats
 */
export function getZeroExCacheStats(): { totalEntries: number; lastUpdated: number } {
  const cache = initCacheIfNeeded();
  return {
    totalEntries: cache.cachedSwaps.length,
    lastUpdated: cache.lastUpdated,
  };
}
