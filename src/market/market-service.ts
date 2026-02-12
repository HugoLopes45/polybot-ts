import { ErrorCategory, TradingError, classifyError } from "../shared/errors.js";
import type { ConditionId } from "../shared/identifiers.js";
import { type Result, err, ok } from "../shared/result.js";
import { SystemClock } from "../shared/time.js";
import type { Clock } from "../shared/time.js";
import type { MarketInfo } from "./types.js";

/**
 * Dependencies required by MarketService to interact with external market data.
 */
export interface MarketServiceDeps {
	getMarket(id: string): Promise<MarketInfo | null>;
	searchMarkets(query: string): Promise<MarketInfo[]>;
}

interface CacheEntry {
	readonly market: MarketInfo;
	readonly expiresAtMs: number;
}

/**
 * Service for accessing market information with caching support.
 * Provides methods to get market details and search markets.
 */
export class MarketService {
	private readonly deps: MarketServiceDeps;
	private readonly clock: Clock;
	private readonly cacheTtlMs: number;
	private readonly cache: Map<string, CacheEntry>;

	constructor(deps: MarketServiceDeps, config?: { cacheTtlMs?: number; clock?: Clock }) {
		this.deps = deps;
		this.clock = config?.clock ?? SystemClock;
		this.cacheTtlMs = config?.cacheTtlMs ?? 60_000;
		this.cache = new Map();
	}

	async getMarket(id: ConditionId): Promise<Result<MarketInfo, TradingError>> {
		const key = id as string;
		const cached = this.cache.get(key);
		if (cached && this.clock.now() < cached.expiresAtMs) {
			return ok(cached.market);
		}

		try {
			const market = await this.deps.getMarket(key);
			if (!market) {
				return err(
					new TradingError("Market not found", "MARKET_NOT_FOUND", ErrorCategory.NonRetryable, {
						conditionId: key,
					}),
				);
			}
			this.cache.set(key, {
				market,
				expiresAtMs: this.clock.now() + this.cacheTtlMs,
			});
			return ok(market);
		} catch (error) {
			return err(classifyError(error));
		}
	}

	async searchMarkets(query: string): Promise<Result<MarketInfo[], TradingError>> {
		try {
			const markets = await this.deps.searchMarkets(query);
			return ok(markets);
		} catch (error) {
			return err(classifyError(error));
		}
	}
}
