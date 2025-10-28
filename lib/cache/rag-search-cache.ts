/**
 * RAG Search Results Cache
 *
 * Caches RAG search results to avoid repeated expensive vector searches
 * and Gemini API calls for similar queries.
 *
 * Target: 80%+ cache hit rate for repeated/similar queries
 * Expected improvement: 90%+ faster for cached queries
 */

import crypto from 'crypto';

export interface RAGSearchCacheEntry {
  /** Cache key */
  key: string;
  /** Original query */
  query: string;
  /** Product ID */
  productId: string;
  /** Cached knowledge context */
  knowledgeContext: string;
  /** Search result count */
  resultCount: number;
  /** Creation timestamp */
  createdAt: number;
  /** Expiration timestamp */
  expiresAt: number;
  /** Hit count */
  hitCount: number;
  /** Last accessed timestamp */
  lastAccessedAt: number;
}

export interface RAGCacheStats {
  /** Total cache hits */
  hits: number;
  /** Total cache misses */
  misses: number;
  /** Hit rate (0-1) */
  hitRate: number;
  /** Total cached searches */
  totalCached: number;
  /** Cache size in bytes */
  cacheSizeBytes: number;
}

/**
 * RAG Search Cache Manager
 *
 * Manages caching of RAG search results to reduce expensive vector DB queries
 */
export class RAGSearchCache {
  private cache: Map<string, RAGSearchCacheEntry>;
  private stats: {
    hits: number;
    misses: number;
  };
  private readonly defaultTTL: number; // milliseconds
  private readonly maxCacheSize: number;

  constructor(options?: {
    defaultTTL?: number; // in seconds
    maxCacheSize?: number;
  }) {
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
    };
    this.defaultTTL = (options?.defaultTTL || 1800) * 1000; // Default: 30 minutes
    this.maxCacheSize = options?.maxCacheSize || 200;

    console.log(`[RAGCache] Initialized with TTL=${this.defaultTTL / 1000}s, maxSize=${this.maxCacheSize}`);
  }

  /**
   * Generate cache key from query text
   *
   * Normalizes query text before hashing for better cache hits
   */
  private generateKey(query: string, productId: string): string {
    // Normalize: lowercase, trim, remove extra spaces
    const normalized = query.toLowerCase().trim().replace(/\s+/g, ' ');

    const hash = crypto
      .createHash('sha256')
      .update(`${productId}:${normalized}`)
      .digest('hex');

    return `rag_${productId}_${hash.substring(0, 16)}`;
  }

  /**
   * Get cached RAG search result
   *
   * @param query - Search query text
   * @param productId - Product ID
   * @returns Cached result if exists and not expired, null otherwise
   */
  get(query: string, productId: string): string | null {
    const key = this.generateKey(query, productId);
    const cached = this.cache.get(key);

    if (!cached) {
      this.stats.misses++;
      console.log(`[RAGCache] MISS for query: "${query.substring(0, 50)}..."`);
      return null;
    }

    // Check expiration
    const now = Date.now();
    if (now > cached.expiresAt) {
      console.log(`[RAGCache] EXPIRED for query: "${query.substring(0, 50)}..."`);
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Update stats
    cached.hitCount++;
    cached.lastAccessedAt = now;
    this.stats.hits++;

    console.log(`[RAGCache] HIT for query: "${query.substring(0, 50)}..." (hits: ${cached.hitCount})`);
    return cached.knowledgeContext;
  }

  /**
   * Cache a RAG search result
   *
   * @param query - Search query text
   * @param productId - Product ID
   * @param knowledgeContext - Knowledge context to cache
   * @param resultCount - Number of search results
   * @param ttl - Time to live in seconds (optional)
   * @returns Cache key
   */
  set(
    query: string,
    productId: string,
    knowledgeContext: string,
    resultCount: number,
    ttl?: number
  ): string {
    const key = this.generateKey(query, productId);
    const now = Date.now();
    const expiresAt = now + (ttl ? ttl * 1000 : this.defaultTTL);

    // Check cache size limit
    if (this.cache.size >= this.maxCacheSize) {
      this.evictLRU();
    }

    const cacheEntry: RAGSearchCacheEntry = {
      key,
      query,
      productId,
      knowledgeContext,
      resultCount,
      createdAt: now,
      expiresAt,
      hitCount: 0,
      lastAccessedAt: now,
    };

    this.cache.set(key, cacheEntry);
    console.log(`[RAGCache] CACHED query: "${query.substring(0, 50)}..." (${resultCount} results, expires in ${(ttl || this.defaultTTL / 1000)}s)`);

    return key;
  }

  /**
   * Evict least recently used (LRU) cache entry
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, cached] of this.cache.entries()) {
      if (cached.lastAccessedAt < oldestTime) {
        oldestTime = cached.lastAccessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const evicted = this.cache.get(oldestKey);
      this.cache.delete(oldestKey);
      console.log(`[RAGCache] EVICTED "${evicted?.query.substring(0, 50)}..." (LRU)`);
    }
  }

  /**
   * Clear all cached results
   */
  clear(): void {
    this.cache.clear();
    console.log(`[RAGCache] CLEARED all cache`);
  }

  /**
   * Remove expired cache entries
   */
  cleanup(): void {
    const now = Date.now();
    let expiredCount = 0;

    for (const [key, cached] of this.cache.entries()) {
      if (now > cached.expiresAt) {
        this.cache.delete(key);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      console.log(`[RAGCache] CLEANUP removed ${expiredCount} expired entries`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): RAGCacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;

    // Calculate cache size in bytes
    let cacheSizeBytes = 0;
    for (const cached of this.cache.values()) {
      cacheSizeBytes += cached.knowledgeContext.length * 2; // UTF-16 encoding
      cacheSizeBytes += cached.query.length * 2;
    }

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate,
      totalCached: this.cache.size,
      cacheSizeBytes,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats.hits = 0;
    this.stats.misses = 0;
    console.log(`[RAGCache] STATS RESET`);
  }
}

/**
 * Global RAG search cache instance (singleton pattern)
 */
let globalRAGCache: RAGSearchCache | null = null;

/**
 * Get or create global RAG search cache instance
 */
export function getRAGCache(): RAGSearchCache {
  if (!globalRAGCache) {
    globalRAGCache = new RAGSearchCache({
      defaultTTL: 1800, // 30 minutes
      maxCacheSize: 200, // Max 200 different queries
    });

    // Auto cleanup every 5 minutes
    setInterval(() => {
      globalRAGCache?.cleanup();
    }, 5 * 60 * 1000);
  }

  return globalRAGCache;
}

/**
 * Create a new RAG search cache instance
 */
export function createRAGCache(options?: {
  defaultTTL?: number;
  maxCacheSize?: number;
}): RAGSearchCache {
  return new RAGSearchCache(options);
}
