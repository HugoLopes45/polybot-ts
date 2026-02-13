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
	getMarket(id: string): Promise<MarketInfo | null>;
	searchMarkets(query: string): Promise<MarketInfo[]>;
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

		let market: MarketInfo | null;
		try {
			market = await this.deps.getMarket(key);
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
			// Cache write failure must not lose a successful API result
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
				new RateLimitError("Rate limit exceeded for searchMarkets", 1000, {
					query,
				}),
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
			// Cache write failure must not lose a successful API result
		}
		return ok(markets);
	}
}
