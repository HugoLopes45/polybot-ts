import type { Clock } from "../../shared/time.js";
import { SystemClock } from "../../shared/time.js";

/**
 * Configuration for a TTL + LRU cache.
 */
export interface CacheConfig {
	/** Time-to-live in milliseconds. Default: 60000ms (1 minute) */
	ttl: number;
	/** Maximum number of entries before LRU eviction */
	maxSize: number;
	/** Injectable clock for deterministic testing. Defaults to SystemClock. */
	clock?: Clock | undefined;
}

interface CacheEntry<T> {
	value: T;
	expires: number;
	accessCount: number;
	lastAccess: number;
}

/**
 * Cache statistics for observability.
 */
export interface CacheStats {
	/** Number of successful cache hits */
	hits: number;
	/** Number of cache misses */
	misses: number;
	/** Hit rate as a fraction between 0 and 1 */
	hitRate: number;
}

/**
 * TTL + LRU cache implementation.
 *
 * Supports:
 * - Time-based expiration (TTL)
 * - Least Recently Used (LRU) eviction
 * - Cache-aside pattern via getOrFetch
 * - Statistics tracking
 *
 * @example
 * ```typescript
 * const cache = new Cache<string>({ ttl: 60000, maxSize: 100 });
 * cache.set("key", "value");
 * cache.get("key"); // "value"
 * ```
 */
export class Cache<T> {
	private readonly cache = new Map<string, CacheEntry<T>>();
	private readonly ttl: number;
	private readonly maxSize: number;
	private readonly clock: Clock;
	private hits = 0;
	private misses = 0;

	/**
	 * Creates a new cache with the specified configuration.
	 * @param config - Cache configuration with ttl and maxSize
	 */
	constructor(config: CacheConfig) {
		this.ttl = config.ttl;
		this.maxSize = config.maxSize;
		this.clock = config.clock ?? SystemClock;
	}

	/**
	 * Retrieves a value from the cache.
	 * @param key - The cache key
	 * @returns The cached value or undefined if not found/expired
	 */
	get(key: string): T | undefined {
		const entry = this.cache.get(key);
		if (!entry) {
			this.misses++;
			return undefined;
		}

		if (this.clock.now() > entry.expires) {
			this.cache.delete(key);
			this.misses++;
			return undefined;
		}

		entry.accessCount++;
		entry.lastAccess = this.clock.now();
		this.hits++;
		return entry.value;
	}

	/**
	 * Stores a value in the cache.
	 * @param key - The cache key
	 * @param value - The value to cache
	 * @param ttl - Optional custom TTL in milliseconds
	 */
	set(key: string, value: T, ttl?: number): void {
		if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
			this.evictLRU();
		}

		this.cache.set(key, {
			value,
			expires: this.clock.now() + (ttl ?? this.ttl),
			accessCount: 0,
			lastAccess: this.clock.now(),
		});
	}

	/**
	 * Gets a cached value or fetches it if not present.
	 * Implements the cache-aside pattern.
	 * @param key - The cache key
	 * @param fetcher - Async function to fetch the value if not cached
	 * @returns The cached or freshly fetched value
	 */
	async getOrFetch(key: string, fetcher: () => Promise<T>): Promise<T> {
		const cached = this.get(key);
		if (cached !== undefined) {
			return cached;
		}

		const value = await fetcher();
		this.set(key, value);
		return value;
	}

	/**
	 * Removes a value from the cache.
	 * @param key - The cache key to delete
	 * @returns true if the key was present, false otherwise
	 */
	delete(key: string): boolean {
		return this.cache.delete(key);
	}

	/**
	 * Clears all entries from the cache.
	 */
	clear(): void {
		this.cache.clear();
	}

	/**
	 * Gets cache statistics.
	 * @returns Object with hits, misses, and hitRate
	 */
	getStats(): CacheStats {
		const total = this.hits + this.misses;
		return {
			hits: this.hits,
			misses: this.misses,
			hitRate: total > 0 ? this.hits / total : 0,
		};
	}

	private evictLRU(): void {
		let oldestKey: string | null = null;
		let oldestAccess = Number.POSITIVE_INFINITY;

		for (const [key, entry] of this.cache) {
			if (entry.lastAccess < oldestAccess) {
				oldestAccess = entry.lastAccess;
				oldestKey = key;
			}
		}

		if (oldestKey) {
			this.cache.delete(oldestKey);
		}
	}
}
