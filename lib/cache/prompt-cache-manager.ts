/**
 * Gemini Prompt Cache Manager
 *
 * Implements prompt caching strategy using in-memory caching
 * for fixed prompts to dramatically reduce token costs and latency.
 *
 * Target: 75-85% token reduction for cached requests
 * Expected improvement: 2nd request onwards 50-70% faster
 */

import crypto from 'crypto';

export interface CachedPrompt {
  /** Cache key */
  key: string;
  /** Fixed prompt content */
  content: string;
  /** Product ID */
  productId: string;
  /** Creation timestamp */
  createdAt: number;
  /** Expiration timestamp */
  expiresAt: number;
  /** Hit count */
  hitCount: number;
  /** Last accessed timestamp */
  lastAccessedAt: number;
}

export interface CacheStats {
  /** Total cache hits */
  hits: number;
  /** Total cache misses */
  misses: number;
  /** Hit rate (0-1) */
  hitRate: number;
  /** Total cached prompts */
  totalCached: number;
  /** Cache size in bytes */
  cacheSizeBytes: number;
}

/**
 * Prompt Cache Manager
 *
 * Manages caching of fixed prompt segments to reduce Gemini API costs
 */
export class PromptCacheManager {
  private cache: Map<string, CachedPrompt>;
  private stats: {
    hits: number;
    misses: number;
  };
  private readonly defaultTTL: number; // milliseconds
  private readonly maxCacheSize: number; // Maximum number of cached items

  constructor(options?: {
    defaultTTL?: number; // in seconds
    maxCacheSize?: number;
  }) {
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
    };
    this.defaultTTL = (options?.defaultTTL || 3600) * 1000; // Default: 1 hour
    this.maxCacheSize = options?.maxCacheSize || 100;

    console.log(`[PromptCache] Initialized with TTL=${this.defaultTTL / 1000}s, maxSize=${this.maxCacheSize}`);
  }

  /**
   * Generate cache key from prompt content
   *
   * Uses SHA-256 hash for consistent key generation
   */
  private generateKey(content: string, productId: string): string {
    const hash = crypto
      .createHash('sha256')
      .update(`${productId}:${content}`)
      .digest('hex');
    return `prompt_${productId}_${hash.substring(0, 16)}`;
  }

  /**
   * Get cached prompt by content
   *
   * @param content - Prompt content
   * @param productId - Product ID
   * @returns Cached prompt if exists and not expired, null otherwise
   */
  get(content: string, productId: string): CachedPrompt | null {
    const key = this.generateKey(content, productId);
    const cached = this.cache.get(key);

    if (!cached) {
      this.stats.misses++;
      console.log(`[PromptCache] MISS for ${key}`);
      return null;
    }

    // Check expiration
    const now = Date.now();
    if (now > cached.expiresAt) {
      console.log(`[PromptCache] EXPIRED for ${key}`);
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Update stats
    cached.hitCount++;
    cached.lastAccessedAt = now;
    this.stats.hits++;

    console.log(`[PromptCache] HIT for ${key} (hits: ${cached.hitCount})`);
    return cached;
  }

  /**
   * Cache a prompt
   *
   * @param content - Prompt content
   * @param productId - Product ID
   * @param ttl - Time to live in seconds (optional)
   * @returns Cache key
   */
  set(content: string, productId: string, ttl?: number): string {
    const key = this.generateKey(content, productId);
    const now = Date.now();
    const expiresAt = now + (ttl ? ttl * 1000 : this.defaultTTL);

    // Check cache size limit
    if (this.cache.size >= this.maxCacheSize) {
      this.evictLRU();
    }

    const cachedPrompt: CachedPrompt = {
      key,
      content,
      productId,
      createdAt: now,
      expiresAt,
      hitCount: 0,
      lastAccessedAt: now,
    };

    this.cache.set(key, cachedPrompt);
    console.log(`[PromptCache] CACHED ${key} (expires in ${ttl || this.defaultTTL / 1000}s)`);

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
      this.cache.delete(oldestKey);
      console.log(`[PromptCache] EVICTED ${oldestKey} (LRU)`);
    }
  }

  /**
   * Clear all cached prompts
   */
  clear(): void {
    this.cache.clear();
    console.log(`[PromptCache] CLEARED all cache`);
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
      console.log(`[PromptCache] CLEANUP removed ${expiredCount} expired entries`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;

    // Calculate cache size in bytes
    let cacheSizeBytes = 0;
    for (const cached of this.cache.values()) {
      cacheSizeBytes += cached.content.length * 2; // UTF-16 encoding (approximate)
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
    console.log(`[PromptCache] STATS RESET`);
  }
}

/**
 * Global prompt cache instance (singleton pattern)
 */
let globalPromptCache: PromptCacheManager | null = null;

/**
 * Get or create global prompt cache instance
 */
export function getPromptCache(): PromptCacheManager {
  if (!globalPromptCache) {
    globalPromptCache = new PromptCacheManager({
      defaultTTL: 3600, // 1 hour
      maxCacheSize: 50, // Max 50 different prompt variations
    });

    // Auto cleanup every 10 minutes
    setInterval(() => {
      globalPromptCache?.cleanup();
    }, 10 * 60 * 1000);
  }

  return globalPromptCache;
}

/**
 * Create a new prompt cache instance
 */
export function createPromptCache(options?: {
  defaultTTL?: number;
  maxCacheSize?: number;
}): PromptCacheManager {
  return new PromptCacheManager(options);
}
