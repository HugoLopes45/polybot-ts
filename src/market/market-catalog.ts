import type { Cache } from "../lib/cache/index.js";
import type { TokenBucketRateLimiter } from "../lib/http/rate-limiter.js";
import { ErrorCategory, RateLimitError, TradingError, classifyError } from "../shared/errors.js";
import type { ConditionId } from "../shared/identifiers.js";
import { type Result, err, ok } from "../shared/result.js";
import { SystemClock } from "../shared/time.js";
import type { Clock } from "../shared/time.js";
import type { MarketInfo } from "./types.js";

/**
 * Dependencies required by MarketCatalog to interact with external market data.
 */
export interface MarketProviders {
	getMarket(id: ConditionId): Promise<MarketInfo | null>;
	searchMarkets(query: string): Promise<MarketInfo[]>;
	getTrending?(limit: number): Promise<MarketInfo[]>;
	getTopByVolume?(limit: number): Promise<MarketInfo[]>;
	getTopByLiquidity?(limit: number): Promise<MarketInfo[]>;
	getByCategory?(category: string): Promise<MarketInfo[]>;
	getActiveEvents?(): Promise<MarketInfo[]>;
}

interface CacheEntry {
	readonly market: MarketInfo;
	readonly expiresAtMs: number;
}

/**
 * Catalog for accessing market information with caching support.
 * Provides methods to get market details and search markets.
 */
export class MarketCatalog {
	private readonly deps: MarketProviders;
	private readonly clock: Clock;
	private readonly cacheTtlMs: number;
	private readonly cache: Map<string, CacheEntry>;
	private readonly searchCache: Cache<MarketInfo[]> | undefined;
	private readonly rateLimiter: TokenBucketRateLimiter | undefined;
	private _cacheWriteErrors = 0;

	constructor(
		deps: MarketProviders,
		config?: {
			cacheTtlMs?: number;
			clock?: Clock;
			searchCache?: Cache<MarketInfo[]>;
			rateLimiter?: TokenBucketRateLimiter;
		},
	) {
		this.deps = deps;
		this.clock = config?.clock ?? SystemClock;
		this.cacheTtlMs = config?.cacheTtlMs ?? 60_000;
		this.cache = new Map();
		this.searchCache = config?.searchCache;
		this.rateLimiter = config?.rateLimiter;
	}

	get cacheWriteErrors(): number {
		return this._cacheWriteErrors;
	}

	/**
	 * Retrieves market information by condition ID, using cache when available.
	 * @param id - The condition ID of the market
	 */
	async getMarket(id: ConditionId): Promise<Result<MarketInfo, TradingError>> {
		const key = id as string;
		const cached = this.cache.get(key);
		if (cached && this.clock.now() < cached.expiresAtMs) {
			return ok(cached.market);
		}
		// Evict stale entry
		if (cached) {
			this.cache.delete(key);
		}

		let market: MarketInfo | null;
		try {
			market = await this.deps.getMarket(id);
		} catch (error) {
			return err(classifyError(error));
		}

		if (!market) {
			return err(
				new TradingError("Market not found", "MARKET_NOT_FOUND", ErrorCategory.NonRetryable, {
					conditionId: key,
				}),
			);
		}

		try {
			this.cache.set(key, {
				market,
				expiresAtMs: this.clock.now() + this.cacheTtlMs,
			});
		} catch {
			this._cacheWriteErrors++;
		}
		return ok(market);
	}

	/**
	 * Searches for markets matching a query string, with optional caching and rate limiting.
	 * @param query - The search query
	 */
	async searchMarkets(query: string): Promise<Result<MarketInfo[], TradingError>> {
		if (this.searchCache) {
			const cached = this.searchCache.get(query);
			if (cached) {
				return ok(cached);
			}
		}

		if (this.rateLimiter && !this.rateLimiter.tryAcquire()) {
			return err(
				new RateLimitError(
					"Rate limit exceeded for searchMarkets",
					this.rateLimiter.timeUntilNextTokenMs(),
					{
						query,
					},
				),
			);
		}

		let markets: MarketInfo[];
		try {
			markets = await this.deps.searchMarkets(query);
		} catch (error) {
			return err(classifyError(error));
		}

		try {
			if (this.searchCache) {
				this.searchCache.set(query, markets);
			}
		} catch {
			this._cacheWriteErrors++;
		}
		return ok(markets);
	}

	/** Returns trending markets from the provider. */
	async getTrending(limit = 10): Promise<Result<MarketInfo[], TradingError>> {
		const v = this.validateLimit(limit);
		if (!v.ok) return v;
		return this.callDiscovery(this.deps.getTrending, "getTrending", limit);
	}

	/** Returns top markets by trading volume. */
	async getTopByVolume(limit = 10): Promise<Result<MarketInfo[], TradingError>> {
		const v = this.validateLimit(limit);
		if (!v.ok) return v;
		return this.callDiscovery(this.deps.getTopByVolume, "getTopByVolume", limit);
	}

	/** Returns top markets by liquidity depth. */
	async getTopByLiquidity(limit = 10): Promise<Result<MarketInfo[], TradingError>> {
		const v = this.validateLimit(limit);
		if (!v.ok) return v;
		return this.callDiscovery(this.deps.getTopByLiquidity, "getTopByLiquidity", limit);
	}

	/** Returns markets in the given category. */
	async getByCategory(category: string): Promise<Result<MarketInfo[], TradingError>> {
		if (!category.trim()) {
			return err(
				new TradingError(
					"Category must not be empty",
					"INVALID_CATEGORY",
					ErrorCategory.NonRetryable,
					{ category },
				),
			);
		}
		return this.callDiscovery(this.deps.getByCategory, "getByCategory", category);
	}

	/** Returns all currently active event markets. */
	async getActiveEvents(): Promise<Result<MarketInfo[], TradingError>> {
		return this.callDiscovery(this.deps.getActiveEvents, "getActiveEvents");
	}

	private async callDiscovery<A extends unknown[]>(
		method: ((...args: A) => Promise<MarketInfo[]>) | undefined,
		methodName: string,
		...args: A
	): Promise<Result<MarketInfo[], TradingError>> {
		if (!method) {
			return err(
				new TradingError(
					`${methodName} is not supported by the configured provider`,
					"NOT_SUPPORTED",
					ErrorCategory.NonRetryable,
				),
			);
		}
		try {
			const markets = await method.call(this.deps, ...args);
			return ok(markets);
		} catch (error) {
			return err(classifyError(error));
		}
	}

	private validateLimit(limit: number): Result<void, TradingError> {
		if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit < 1) {
			return err(
				new TradingError(
					"Limit must be a positive integer >= 1",
					"INVALID_LIMIT",
					ErrorCategory.NonRetryable,
					{ limit },
				),
			);
		}
		return ok(undefined);
	}
}
