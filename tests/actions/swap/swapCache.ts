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
      cachedSwaps: []
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
      cachedSwaps: []
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
    selector: data.selector.toLowerCase()
  };
  
  // Check if we already have this exact swap in the cache
  // Include more parameters in the cache key to avoid overwriting different swap scenarios
  const existingIndex = cache.cachedSwaps.findIndex(
    swap => 
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
export function getSwapFromCache(
  sourceToken: string,
  destToken: string,
  exchangeType: string,
  amount?: string,
  selector?: string
): CachedSwapData | null {
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

    // Get current block number from hardhat config
    const hardhatConfig = require('../../../hardhat.config');
    const currentBlockNumber = hardhatConfig.networks?.hardhat?.forking?.blockNumber;
    const BLOCK_TOLERANCE = 100; // Allow matches within 100 blocks
    
    // First try to find an exact match with all parameters
    let foundSwap = cache.cachedSwaps.find(swap => {
      const basicMatch = 
        swap.sourceToken.toLowerCase() === normalizedSourceToken && 
        swap.destToken.toLowerCase() === normalizedDestToken &&
        swap.exchangeType.toLowerCase() === normalizedExchangeType;

      const fullMatch = basicMatch &&
        (!amount || swap.amount === amount) &&
        (!normalizedSelector || swap.selector.toLowerCase() === normalizedSelector);

      // If we have block numbers, check they're within tolerance
      if (fullMatch && currentBlockNumber && swap.blockNumber) {
        return Math.abs(currentBlockNumber - swap.blockNumber) <= BLOCK_TOLERANCE;
      }

      return fullMatch;
    });

    // If no exact match found, try to find a match with just the tokens and exchange type
    if (!foundSwap) {
      foundSwap = cache.cachedSwaps.find(swap => {
        const basicMatch = 
          swap.sourceToken.toLowerCase() === normalizedSourceToken && 
          swap.destToken.toLowerCase() === normalizedDestToken &&
          swap.exchangeType.toLowerCase() === normalizedExchangeType;

        // If we have block numbers, check they're within tolerance
        if (basicMatch && currentBlockNumber && swap.blockNumber) {
          return Math.abs(currentBlockNumber - swap.blockNumber) <= BLOCK_TOLERANCE;
        }

        return basicMatch;
      });
    }
    
    return foundSwap || null;
  } catch (error) {
    log('Error reading from cache file:', error);
    return null;
  }
}

/**
 * Check if we're using a historic fork
 * Returns true if we're using a fork that's considered "historic" (old)
 * Returns false if we're using a recent fork that should fetch fresh data
 */
export async function isUsingForkedNetwork(): Promise<boolean> {
  try {
    const hardhat = await import('hardhat');
    const provider = hardhat.ethers.provider;

    // Get the latest block from our forked network
    const latestBlock = await provider.getBlock('latest');
    if (!latestBlock) {
      log('Could not get latest block, assuming historic fork');
      return true;
    }

    // Get current timestamp
    const currentTimestamp = Math.floor(Date.now() / 1000);
    
    // Define what we consider "historic" - configurable via env var, default to 1 hour
    const HISTORIC_THRESHOLD = process.env.HISTORIC_FORK_THRESHOLD 
      ? parseInt(process.env.HISTORIC_FORK_THRESHOLD) 
      : 3600; // 1 second by default to allow using cache even with recent blocks

    const blockAge = currentTimestamp - latestBlock.timestamp;
    
    log('Fork age detection:', {
      networkName: hardhat.network.name,
      blockNumber: latestBlock.number,
      blockTimestamp: latestBlock.timestamp,
      currentTimestamp,
      blockAge,
      historicThreshold: HISTORIC_THRESHOLD,
      isHistoric: blockAge > HISTORIC_THRESHOLD
    });
    
    // If block is older than threshold, consider it historic
    return blockAge > HISTORIC_THRESHOLD;
  } catch (error) {
    log('Error checking network type:', error);
    // If we can't determine, assume it's historic to be safe
    return true;
  }
}

/**
 * Get current block number
 */
export async function getCurrentBlockNumber(): Promise<number> {
  try {
    const provider = await import('hardhat').then(hardhat => hardhat.ethers.provider);
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
): Promise<{ callData: string; destAmount: string; minDestAmount: string; dexProtocol?: string; priceRoute?: any }> {
  const srcTokenAddress = srcToken.startsWith('0x') ? srcToken : tokenConfig[srcToken as keyof typeof tokenConfig].address;
  const destTokenAddress = destToken.startsWith('0x') ? destToken : tokenConfig[destToken as keyof typeof tokenConfig].address;
  
  const srcDecimals = srcToken.startsWith('0x') 
    ? (srcToken.toLowerCase() === tokenConfig.USDC.address.toLowerCase() ? 6 : 
       srcToken.toLowerCase() === tokenConfig.USDT.address.toLowerCase() ? 6 : 18)
    : tokenConfig[srcToken as keyof typeof tokenConfig].decimals;

  const destDecimals = destToken.startsWith('0x')
    ? (destToken.toLowerCase() === tokenConfig.USDC.address.toLowerCase() ? 6 :
       destToken.toLowerCase() === tokenConfig.USDT.address.toLowerCase() ? 6 : 18)
    : tokenConfig[destToken as keyof typeof tokenConfig].decimals;

  // Check if we're using a forked network
  const isForked = await isUsingForkedNetwork();
  log('Network status:', { isForked });
  
  const exchangeType = dex?.toLowerCase() || 'basic';

  // Try to get from cache first
  const cachedSwap = getSwapFromCache(
    srcToken, 
    destToken, 
    exchangeType,
    amount.toString()
  );
  log('Cache status:', { 
    hasCachedSwap: !!cachedSwap, 
    srcToken, 
    destToken, 
    exchangeType,
    amount: amount.toString()
  });
  if (cachedSwap) {
    // In forked mode, always use cache if available
    if (isForked) {
      return {
        callData: cachedSwap.callData,
        destAmount: cachedSwap.destAmount,
        minDestAmount: cachedSwap.minToAmount,
        dexProtocol: cachedSwap.dexProtocol,
        priceRoute: {
          bestRoute: cachedSwap.priceRoute?.bestRoute,
          contractMethod: cachedSwap.priceRoute?.contractMethod,
          tokenTransferProxy: cachedSwap.priceRoute?.tokenTransferProxy
        }
      };
    }
  }
  
  // If we're in forked mode and no cache is available, throw error
  if (isForked) {
    throw new Error(
      `No cached quote found for ${srcToken} to ${destToken} (${exchangeType}). ` +
      `Please run tests against the latest state to cache new quotes.`
    );
  }

  // If not in forked mode, fetch from API
  const params = {
    srcToken: srcTokenAddress,
    destToken: destTokenAddress,
    amount: amount.toString(),
    srcDecimals,
    destDecimals,
    side: 'SELL',
    userAddress: safeAddr,
    slippage: 100,  // This is 1% slippage (100 basis points)
    network: 1,
    version: '6.2',
    ...(dex ? { includeDEXS: dex } : {})
  };

  log('Paraswap API request:', {
    url: 'https://api.paraswap.io/swap',
    params
  });

  try {
    const response = await axios.get('https://api.paraswap.io/swap', {
      params
    });

    log('Paraswap API response:', {
      hasRoute: !!response.data?.priceRoute,
      priceRoute: response.data?.priceRoute,
      txParams: response.data?.txParams
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

    // Only save to cache if we're not in forked mode
    if (!isForked) {
      const currentBlock = await getCurrentBlockNumber();
      saveSwapToCache({
        timestamp: Date.now(),
        blockNumber: currentBlock,
        sourceToken: srcToken,
        destToken: destToken,
        amount: amount.toString(),
        minToAmount: minDestAmount,  // Store the minimum amount we'll accept
        selector,
        callData: response.data.txParams.data,
        destAmount: destAmount,      // Store the expected amount before slippage
        exchangeType,
        dexProtocol: response.data.priceRoute.bestRoute[0]?.swaps[0]?.swapExchanges[0]?.exchange || 'unknown',
        priceRoute: {
          bestRoute: response.data.priceRoute.bestRoute,
          contractMethod: response.data.priceRoute.contractMethod,
          tokenTransferProxy: response.data.priceRoute.tokenTransferProxy
        }
      });
    }

    return {
      callData: response.data.txParams.data,
      destAmount: destAmount,      // Return expected amount before slippage
      minDestAmount: minDestAmount, // Return minimum amount we'll accept
      dexProtocol: response.data.priceRoute.bestRoute[0]?.swaps[0]?.swapExchanges[0]?.exchange || 'unknown',
      priceRoute: response.data.priceRoute
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
  isUsingForkedNetwork,
  getCurrentBlockNumber
}; 