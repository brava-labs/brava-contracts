/**
 * SwapCache - A utility for caching Paraswap API responses for testing
 *
 * This file provides functions to store and retrieve swap data to/from a JSON file
 * allowing tests to run in both live and forked environments.
 */

import fs from 'fs';
import path from 'path';
import { BigNumberish } from 'ethers';
import { log } from '../../utils';
import axios from 'axios';
import { tokenConfig } from '../../constants';

// Path to the cache file
const CACHE_FILE_PATH = path.join(__dirname, 'paraswapCache.json');

// Type definition for cached swap data
export interface CachedSwapData {
  timestamp: number;
  blockNumber?: number;
  sourceToken: string;
  destToken: string;
  amount: string;
  minToAmount: string;
  selector: string;
  callData: string;
  destAmount: string;
  exchangeType: string;
  dexProtocol: string;
  priceRoute: {
    bestRoute?: any[];
    contractMethod?: string;
    tokenTransferProxy?: string;
  };
}

// Type for the entire cache
interface SwapCache {
  version: string;
  lastUpdated: number;
  cachedSwaps: CachedSwapData[];
}

/**
 * Initialize the cache file if it doesn't exist
 */
function initCacheIfNeeded(): SwapCache {
  if (!fs.existsSync(CACHE_FILE_PATH)) {
    const initialCache: SwapCache = {
      version: '1.0',
      lastUpdated: Date.now(),
      cachedSwaps: [],
    };
    fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(initialCache, null, 2));
    return initialCache;
  }

  try {
    const cacheContent = fs.readFileSync(CACHE_FILE_PATH, 'utf8');
    return JSON.parse(cacheContent) as SwapCache;
  } catch (error) {
    log('Error reading cache file, creating new one:', error);
    const initialCache: SwapCache = {
      version: '1.0',
      lastUpdated: Date.now(),
      cachedSwaps: [],
    };
    fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(initialCache, null, 2));
    return initialCache;
  }
}

/**
 * Save swap data to cache
 */
export function saveSwapToCache(data: CachedSwapData): void {
  const cache = initCacheIfNeeded();

  // Normalize addresses to lowercase for consistent cache hits
  const normalizedData = {
    ...data,
    sourceToken: data.sourceToken.toLowerCase(),
    destToken: data.destToken.toLowerCase(),
    exchangeType: data.exchangeType.toLowerCase(),
    selector: data.selector.toLowerCase(),
  };

  // Check if we already have this exact swap in the cache
  // Include more parameters in the cache key to avoid overwriting different swap scenarios
  const existingIndex = cache.cachedSwaps.findIndex(
    (swap) =>
      swap.sourceToken.toLowerCase() === normalizedData.sourceToken &&
      swap.destToken.toLowerCase() === normalizedData.destToken &&
      swap.exchangeType.toLowerCase() === normalizedData.exchangeType &&
      swap.selector.toLowerCase() === normalizedData.selector &&
      swap.amount === normalizedData.amount
  );

  if (existingIndex >= 0) {
    // Update existing entry
    cache.cachedSwaps[existingIndex] = normalizedData;
  } else {
    // Add new entry
    cache.cachedSwaps.push(normalizedData);
  }

  cache.lastUpdated = Date.now();

  try {
    fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(cache, null, 2));
  } catch (error) {
    log('Error writing to cache file:', error);
  }
}

/**
 * Get swap data from cache
 */
export async function getSwapFromCache(
  sourceToken: string,
  destToken: string,
  exchangeType: string,
  amount?: string,
  selector?: string
): Promise<CachedSwapData | null> {
  try {
    if (!fs.existsSync(CACHE_FILE_PATH)) {
      return null;
    }

    const cacheContent = fs.readFileSync(CACHE_FILE_PATH, 'utf8');
    const cache = JSON.parse(cacheContent) as SwapCache;

    // Normalize addresses to lowercase for consistent cache hits
    const normalizedSourceToken = sourceToken.toLowerCase();
    const normalizedDestToken = destToken.toLowerCase();
    const normalizedExchangeType = exchangeType.toLowerCase();
    const normalizedSelector = selector?.toLowerCase();

    // Get current block number from provider
    const { ethers } = await import('hardhat');
    const provider = ethers.provider;
    const currentBlockNumber = await provider.getBlockNumber();
    const BLOCK_TOLERANCE = 100; // Allow matches within 100 blocks

    log('Cache check details:', {
      currentBlockNumber,
      sourceToken: normalizedSourceToken,
      destToken: normalizedDestToken,
      exchangeType: normalizedExchangeType,
      amount,
    });

    // First try to find an exact match with all parameters
    for (const swap of cache.cachedSwaps) {
      const basicMatch =
        swap.sourceToken.toLowerCase() === normalizedSourceToken &&
        swap.destToken.toLowerCase() === normalizedDestToken &&
        swap.exchangeType.toLowerCase() === normalizedExchangeType;

      const fullMatch =
        basicMatch &&
        (!amount || swap.amount === amount) &&
        (!normalizedSelector || swap.selector.toLowerCase() === normalizedSelector);

      // Always check block numbers are within tolerance
      if (fullMatch && swap.blockNumber) {
        const isWithinTolerance =
          Math.abs(currentBlockNumber - swap.blockNumber) <= BLOCK_TOLERANCE;

        log('Cache match details:', {
          swapBlockNumber: swap.blockNumber,
          currentBlock: currentBlockNumber,
          isWithinTolerance,
          blockDifference: Math.abs(currentBlockNumber - swap.blockNumber),
        });

        if (isWithinTolerance) {
          return swap;
        }
      }
    }

    return null;
  } catch (error) {
    log('Error reading from cache file:', error);
    return null;
  }
}

/**
 * Get current block number
 */
export async function getCurrentBlockNumber(): Promise<number> {
  try {
    const provider = await import('hardhat').then((hardhat) => hardhat.ethers.provider);
    return Number(await provider.getBlockNumber());
  } catch (error) {
    log('Error getting block number:', error);
    return 0;
  }
}

/**
 * Get swap data from Paraswap API or cache
 */
export async function getSwapData(
  srcToken: string,
  destToken: string,
  amount: BigNumberish,
  safeAddr: string,
  dex?: string
): Promise<{
  callData: string;
  destAmount: string;
  minDestAmount: string;
  dexProtocol?: string;
  priceRoute?: any;
}> {
  const srcTokenAddress = srcToken.startsWith('0x')
    ? srcToken
    : tokenConfig[srcToken as keyof typeof tokenConfig].address;
  const destTokenAddress = destToken.startsWith('0x')
    ? destToken
    : tokenConfig[destToken as keyof typeof tokenConfig].address;

  const srcDecimals = srcToken.startsWith('0x')
    ? srcToken.toLowerCase() === tokenConfig.USDC.address.toLowerCase()
      ? 6
      : srcToken.toLowerCase() === tokenConfig.USDT.address.toLowerCase()
        ? 6
        : 18
    : tokenConfig[srcToken as keyof typeof tokenConfig].decimals;

  const destDecimals = destToken.startsWith('0x')
    ? destToken.toLowerCase() === tokenConfig.USDC.address.toLowerCase()
      ? 6
      : destToken.toLowerCase() === tokenConfig.USDT.address.toLowerCase()
        ? 6
        : 18
    : tokenConfig[destToken as keyof typeof tokenConfig].decimals;

  const exchangeType = dex?.toLowerCase() || 'basic';

  // Always try to get from cache first
  const cachedSwap = await getSwapFromCache(srcToken, destToken, exchangeType, amount.toString());

  log('Cache status:', {
    hasCachedSwap: !!cachedSwap,
    srcToken,
    destToken,
    exchangeType,
    amount: amount.toString(),
  });

  // If we have valid cached data (within block tolerance), use it
  if (cachedSwap) {
    return {
      callData: cachedSwap.callData,
      destAmount: cachedSwap.destAmount,
      minDestAmount: cachedSwap.minToAmount,
      dexProtocol: cachedSwap.dexProtocol,
      priceRoute: {
        bestRoute: cachedSwap.priceRoute?.bestRoute,
        contractMethod: cachedSwap.priceRoute?.contractMethod,
        tokenTransferProxy: cachedSwap.priceRoute?.tokenTransferProxy,
      },
    };
  }

  // No valid cache available - fetch from API
  const params = {
    srcToken: srcTokenAddress,
    destToken: destTokenAddress,
    amount: amount.toString(),
    srcDecimals,
    destDecimals,
    side: 'SELL',
    userAddress: safeAddr,
    slippage: 100, // This is 1% slippage (100 basis points)
    network: 1,
    version: '6.2',
    ...(dex ? { includeDEXS: dex } : {}),
  };

  log('No cache found, fetching from Paraswap API:', {
    url: 'https://api.paraswap.io/swap',
    params,
  });

  // Log the complete URL that will be called
  const url = new URL('https://api.paraswap.io/swap');
  const stringParams = Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, String(value)])
  );
  url.search = new URLSearchParams(stringParams).toString();
  log('Complete Paraswap API URL:', url.toString());

  try {
    const response = await axios.get('https://api.paraswap.io/swap', {
      params,
    });

    log('Paraswap API response:', {
      hasRoute: !!response.data?.priceRoute,
      priceRoute: response.data?.priceRoute,
      txParams: response.data?.txParams,
    });

    if (!response.data?.priceRoute) {
      throw new Error('No price route found');
    }

    // destAmount from API is the expected output before slippage
    const destAmount = response.data.priceRoute.destAmount;

    // Calculate minimum amount we'll accept (with 1% slippage)
    const slippageFactor = (10000 - 100) / 10000; // 100 basis points = 1%
    const minDestAmount = Math.floor(Number(destAmount) * slippageFactor).toString();

    // Extract selector from calldata
    const selector = response.data.txParams.data.substring(0, 10);

    // Always save new API responses to cache
    const currentBlock = await getCurrentBlockNumber();
    saveSwapToCache({
      timestamp: Date.now(),
      blockNumber: currentBlock,
      sourceToken: srcToken,
      destToken: destToken,
      amount: amount.toString(),
      minToAmount: minDestAmount,
      selector,
      callData: response.data.txParams.data,
      destAmount: destAmount,
      exchangeType,
      dexProtocol:
        response.data.priceRoute.bestRoute[0]?.swaps[0]?.swapExchanges[0]?.exchange || 'unknown',
      priceRoute: {
        bestRoute: response.data.priceRoute.bestRoute,
        contractMethod: response.data.priceRoute.contractMethod,
        tokenTransferProxy: response.data.priceRoute.tokenTransferProxy,
      },
    });

    return {
      callData: response.data.txParams.data,
      destAmount: destAmount,
      minDestAmount: minDestAmount,
      dexProtocol:
        response.data.priceRoute.bestRoute[0]?.swaps[0]?.swapExchanges[0]?.exchange || 'unknown',
      priceRoute: response.data.priceRoute,
    };
  } catch (error: any) {
    if (error?.response?.data?.error?.includes('No routes found with enough liquidity')) {
      throw new Error('No liquidity');
    }
    throw error;
  }
}

export default {
  saveSwapToCache,
  getSwapFromCache,
  getCurrentBlockNumber,
};
