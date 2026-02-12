export interface CacheConfig {
	ttl: number;
	maxSize: number;
}

interface CacheEntry<T> {
	value: T;
	expires: number;
	accessCount: number;
	lastAccess: number;
}

export interface CacheStats {
	hits: number;
	misses: number;
	hitRate: number;
}

export class Cache<T> {
	private readonly cache = new Map<string, CacheEntry<T>>();
	private readonly ttl: number;
	private readonly maxSize: number;
	private hits = 0;
	private misses = 0;

	constructor(config: CacheConfig) {
		this.ttl = config.ttl;
		this.maxSize = config.maxSize;
	}

	get(key: string): T | undefined {
		const entry = this.cache.get(key);
		if (!entry) {
			this.misses++;
			return undefined;
		}

		if (Date.now() > entry.expires) {
			this.cache.delete(key);
			this.misses++;
			return undefined;
		}

		entry.accessCount++;
		entry.lastAccess = Date.now();
		this.hits++;
		return entry.value;
	}

	set(key: string, value: T, ttl?: number): void {
		if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
			this.evictLRU();
		}

		this.cache.set(key, {
			value,
			expires: Date.now() + (ttl ?? this.ttl),
			accessCount: 0,
			lastAccess: Date.now(),
		});
	}

	async getOrFetch(key: string, fetcher: () => Promise<T>): Promise<T> {
		const cached = this.get(key);
		if (cached !== undefined) {
			return cached;
		}

		const value = await fetcher();
		this.set(key, value);
		return value;
	}

	delete(key: string): boolean {
		return this.cache.delete(key);
	}

	clear(): void {
		this.cache.clear();
	}

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
