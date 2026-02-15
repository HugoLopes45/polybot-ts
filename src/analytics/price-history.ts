import type { Cache } from "../lib/cache/index.js";
import type { TokenBucketRateLimiter } from "../lib/http/rate-limiter.js";
import type { Decimal } from "../shared/decimal.js";
import { ErrorCategory, RateLimitError, TradingError, classifyError } from "../shared/errors.js";
import type { ConditionId } from "../shared/identifiers.js";
import { type Result, err, ok } from "../shared/result.js";

export type PriceInterval = "max" | "1w" | "1d" | "6h" | "1h";

export const VALID_INTERVALS: ReadonlySet<PriceInterval> = new Set<PriceInterval>([
	"max",
	"1w",
	"1d",
	"6h",
	"1h",
]);

export interface PricePoint {
	readonly timestampMs: number;
	readonly price: Decimal;
}

export interface PriceHistoryProvider {
	getPriceHistory(
		conditionId: ConditionId,
		interval: PriceInterval,
		limit?: number,
	): Promise<PricePoint[]>;
}

interface PriceHistoryClientConfig {
	readonly rateLimiter?: TokenBucketRateLimiter;
	readonly cache?: Cache<PricePoint[]>;
}

export class PriceHistoryClient {
	private readonly provider: PriceHistoryProvider;
	private readonly rateLimiter: TokenBucketRateLimiter | undefined;
	private readonly cache: Cache<PricePoint[]> | undefined;
	private _cacheWriteErrors = 0;

	constructor(provider: PriceHistoryProvider, config?: PriceHistoryClientConfig) {
		this.provider = provider;
		this.rateLimiter = config?.rateLimiter;
		this.cache = config?.cache;
	}

	get cacheWriteErrors(): number {
		return this._cacheWriteErrors;
	}

	async getPriceHistory(
		conditionId: ConditionId,
		interval: PriceInterval,
		limit?: number,
	): Promise<Result<PricePoint[], TradingError>> {
		if (!VALID_INTERVALS.has(interval)) {
			return err(
				new TradingError(
					`Invalid interval: ${interval}`,
					"INVALID_INTERVAL",
					ErrorCategory.NonRetryable,
					{ interval },
				),
			);
		}

		if (limit !== undefined && limit < 1) {
			return err(
				new TradingError("Limit must be >= 1", "INVALID_LIMIT", ErrorCategory.NonRetryable, {
					limit,
				}),
			);
		}

		const cacheKey = `${conditionId as string}:${interval}:${limit ?? "default"}`;

		if (this.cache) {
			const cached = this.cache.get(cacheKey);
			if (cached) return ok(cached);
		}

		if (this.rateLimiter && !this.rateLimiter.tryAcquire()) {
			return err(
				new RateLimitError(
					"Rate limit exceeded for getPriceHistory",
					this.rateLimiter.timeUntilNextTokenMs(),
				),
			);
		}

		let points: PricePoint[];
		try {
			points = await this.provider.getPriceHistory(conditionId, interval, limit);
		} catch (error) {
			return err(classifyError(error));
		}

		const sorted = [...points].sort((a, b) => a.timestampMs - b.timestampMs);

		try {
			if (this.cache) {
				this.cache.set(cacheKey, sorted);
			}
		} catch {
			this._cacheWriteErrors++;
		}

		return ok(sorted);
	}
}
