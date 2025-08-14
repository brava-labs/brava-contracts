/**
 * NexusCache - A utility for caching Nexus Mutual API responses for testing
 *
 * This file provides functions to store and retrieve cover quote data to/from a JSON file
 * allowing tests to run in both live and forked environments.
 */

import fs from 'fs';
import path from 'path';
import { log } from '../../shared-utils';
import { Quote, CoverAsset } from '@nexusmutual/sdk';

// Path to the cache file
const CACHE_FILE_PATH = path.join(__dirname, 'nexusMutualCache.json');

// Cache statistics for validation
let cacheStats = {
  hits: 0,
  misses: 0,
  apiCalls: 0,
};

export function getCacheStats() {
  return { ...cacheStats };
}

export function resetCacheStats() {
  cacheStats = { hits: 0, misses: 0, apiCalls: 0 };
}

// Type definition for cached quote data
export interface CachedCoverData {
  timestamp: number;
  blockNumber?: number;
  productId: number;
  coverAmount: string;
  period: number;
  coverAsset: CoverAsset;
  owner: string;
  buyCoverParams: any;
  poolAllocationRequests: any[];
}

// Type for the entire cache
interface NexusCache {
  version: string;
  lastUpdated: number;
  cachedQuotes: CachedCoverData[];
}

/**
 * Initialize the cache file if it doesn't exist
 */
function initCacheIfNeeded(): NexusCache {
  if (!fs.existsSync(CACHE_FILE_PATH)) {
    const initialCache: NexusCache = {
      version: '1.0',
      lastUpdated: Date.now(),
      cachedQuotes: [],
    };
    fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(initialCache, null, 2));
    return initialCache;
  }

  try {
    const cacheContent = fs.readFileSync(CACHE_FILE_PATH, 'utf8');
    return JSON.parse(cacheContent) as NexusCache;
  } catch (error) {
    log('Error reading cache file, creating new one:', error);
    const initialCache: NexusCache = {
      version: '1.0',
      lastUpdated: Date.now(),
      cachedQuotes: [],
    };
    fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(initialCache, null, 2));
    return initialCache;
  }
}

/**
 * Save cover data to cache
 */
export function saveCoverToCache(data: CachedCoverData): void {
  const cache = initCacheIfNeeded();

  // Check if we already have this exact cover in the cache
  const existingIndex = cache.cachedQuotes.findIndex(
    (quote) =>
      quote.productId === data.productId &&
      quote.coverAsset === data.coverAsset &&
      quote.coverAmount === data.coverAmount &&
      quote.period === data.period
  );

  if (existingIndex >= 0) {
    // Update existing entry
    cache.cachedQuotes[existingIndex] = data;
  } else {
    // Add new entry
    cache.cachedQuotes.push(data);
  }

  cache.lastUpdated = Date.now();

  try {
    fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(cache, null, 2));
  } catch (error) {
    log('Error writing to cache file:', error);
  }
}

/**
 * Get cover data from cache
 */
export async function getCoverFromCache(
  productId: number,
  coverAmount: string,
  period: number,
  coverAsset: CoverAsset
): Promise<CachedCoverData | null> {
  try {
    if (!fs.existsSync(CACHE_FILE_PATH)) {
      return null;
    }

    const cacheContent = fs.readFileSync(CACHE_FILE_PATH, 'utf8');
    const cache = JSON.parse(cacheContent) as NexusCache;

    // Get current block number from provider
    const { ethers } = await import('hardhat');
    const provider = ethers.provider;
    const currentBlockNumber = await provider.getBlockNumber();
    const BLOCK_TOLERANCE = 100; // Allow matches within 100 blocks

    log('Cache check details:', {
      currentBlockNumber,
      productId,
      coverAmount,
      period,
      coverAsset,
    });

    // Try to find a match with all parameters
    for (const quote of cache.cachedQuotes) {
      const basicMatch =
        quote.productId === productId &&
        quote.coverAsset === coverAsset &&
        quote.coverAmount === coverAmount &&
        quote.period === period;

      // Check block numbers are within tolerance
      if (basicMatch && quote.blockNumber) {
        const isWithinTolerance =
          Math.abs(currentBlockNumber - quote.blockNumber) <= BLOCK_TOLERANCE;

        log('Cache match details:', {
          quoteBlockNumber: quote.blockNumber,
          currentBlock: currentBlockNumber,
          isWithinTolerance,
          blockDifference: Math.abs(currentBlockNumber - quote.blockNumber),
        });

        if (isWithinTolerance) {
          return quote;
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
    const hardhat = await import('hardhat');
    const provider = hardhat.ethers.provider;
    return Number(await provider.getBlockNumber());
  } catch (error) {
    log('Error getting block number:', error);
    return 0;
  }
}

/**
 * Normalize poolAllocationRequests to match the new contract interface
 * (remove skip field and ensure poolId is uint256)
 */
function normalizePoolAllocationRequests(requests: any[]): any[] {
  return requests.map((request) => {
    // Create a new object without the skip field
    const { skip, ...rest } = request;

    // Ensure poolId is a number (not a string)
    return {
      ...rest,
      poolId: typeof rest.poolId === 'string' ? Number(rest.poolId) : rest.poolId,
    };
  });
}

/**
 * Get cover quote from Nexus Mutual API or cache
 */
export async function getCoverQuote(
  productId: number,
  coverAmount: string,
  daysToInsure: number,
  coverAsset: CoverAsset,
  owner: string
): Promise<{ buyCoverParams: any; poolAllocationRequests: any[] }> {
  // Convert days to seconds for period
  const period = daysToInsure * 24 * 60 * 60;

  // Try to get from cache first
  const cachedQuote = await getCoverFromCache(productId, coverAmount, period, coverAsset);

  log('Cache status:', {
    hasCachedQuote: !!cachedQuote,
    productId,
    coverAmount,
    period,
    coverAsset,
  });

  // If we have valid cached data (within block tolerance), use it
  if (cachedQuote) {
    // Update the owner address if different from cached
    const buyCoverParams = {
      ...cachedQuote.buyCoverParams,
      owner, // Always use the current owner
    };

    cacheStats.hits++;

    log('🎯 CACHE HIT - Using cached quote:', {
      cachedTimestamp: cachedQuote.timestamp,
      cachedBlockNumber: cachedQuote.blockNumber,
      coverAsset: cachedQuote.coverAsset,
      productId: cachedQuote.productId,
      coverAmount: cachedQuote.coverAmount,
      cacheHitCount: cacheStats.hits,
    });

    // Add a unique identifier to the cached response to prove it's from cache
    const cacheIdentifier = `CACHED_${cachedQuote.timestamp}_${cachedQuote.blockNumber}`;
    log(`🔍 CACHE VALIDATION: Response identifier = ${cacheIdentifier} (HIT #${cacheStats.hits})`);

    return {
      buyCoverParams,
      poolAllocationRequests: cachedQuote.poolAllocationRequests,
    };
  }

  // No valid cache available - fetch from API
  try {
    cacheStats.misses++;
    cacheStats.apiCalls++;

    log('🌐 CACHE MISS - Fetching from Nexus Mutual API:', {
      productId,
      coverAmount,
      daysToInsure,
      coverAsset,
      owner,
      cacheMissCount: cacheStats.misses,
      apiCallCount: cacheStats.apiCalls,
    });

    const apiCallTimestamp = Date.now();
    log(
      `🔍 API VALIDATION: Starting API call at timestamp = ${apiCallTimestamp} (MISS #${cacheStats.misses})`
    );

    // Create Quote instance
    const quote = new Quote();

    // First try without IPFS content
    let response = await quote.getQuoteAndBuyCoverInputs({
      productId,
      amount: coverAmount,
      period: daysToInsure,
      coverAsset,
      buyerAddress: owner,
    });

    // If the API response indicates that IPFS content is required, add it and retry
    if (!response.result && response.error?.message?.includes('Missing IPFS content')) {
      log('IPFS content required for this product, retrying with wallet addresses');

      // Create IPFS content with wallet addresses for cover
      const ipfsContent = {
        version: '2.0' as const,
        walletAddresses: [owner],
      };

      log('Using IPFS content for coverWalletAddresses:', ipfsContent);

      // Retry with IPFS content
      response = await quote.getQuoteAndBuyCoverInputs({
        productId,
        amount: coverAmount,
        period: daysToInsure,
        coverAsset,
        buyerAddress: owner,
        ipfsCidOrContent: ipfsContent,
      });
    }

    log(
      'Nexus Mutual API response structure:',
      JSON.stringify(
        {
          resultKeys: response.result ? Object.keys(response.result) : 'No result',
          errorKeys: response.error ? Object.keys(response.error) : 'No error',
        },
        null,
        2
      )
    );

    if (!response.result) {
      throw new Error(`Failed to get quote: ${response.error?.message || 'Unknown error'}`);
    }

    log(
      'Nexus Mutual buyCoverInput keys:',
      JSON.stringify(Object.keys(response.result.buyCoverInput), null, 2)
    );

    const { buyCoverParams, poolAllocationRequests } = response.result.buyCoverInput;

    // Log the full exact structure with all values for debugging
    log('Full BuyCoverParams:', JSON.stringify(buyCoverParams, null, 2));
    log('Full PoolAllocationRequests:', JSON.stringify(poolAllocationRequests, null, 2));

    // Always save new API responses to cache
    const currentBlock = await getCurrentBlockNumber();
    const freshTimestamp = Date.now();

    log(`🌟 API SUCCESS - Fresh quote received at timestamp = ${freshTimestamp}`);

    saveCoverToCache({
      timestamp: freshTimestamp,
      blockNumber: currentBlock,
      productId,
      coverAmount,
      period,
      coverAsset,
      owner,
      buyCoverParams,
      poolAllocationRequests,
    });

    // Add a unique identifier to the API response to prove it's fresh
    const apiIdentifier = `API_${freshTimestamp}_${currentBlock}`;
    log(`🔍 API VALIDATION: Response identifier = ${apiIdentifier}`);

    return {
      buyCoverParams,
      poolAllocationRequests,
    };
  } catch (error: any) {
    log('Error fetching from Nexus Mutual API:', error);
    throw error;
  }
}

export default {
  saveCoverToCache,
  getCoverFromCache,
  getCurrentBlockNumber,
  getCoverQuote,
};
