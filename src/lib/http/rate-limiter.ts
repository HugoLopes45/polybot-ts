import { ConfigError, RateLimitError } from "../../shared/errors.js";
import type { Clock } from "../../shared/time.js";

/**
 * Configuration for TokenBucketRateLimiter.
 */
export interface RateLimiterConfig {
	readonly capacity: number;
	readonly refillRate: number;
	readonly clock: Clock;
}

/** Snapshot of rate limiter usage statistics. */
export interface RateLimiterStats {
	readonly hits: number;
	readonly misses: number;
	readonly waits: number;
	readonly avgWaitMs: number;
}

/**
 * Token-bucket rate limiter with injectable clock for deterministic testing.
 *
 * Tokens accumulate at `refillRate` tokens/second up to `capacity`.
 * Each `tryAcquire()` consumes one token; `waitForToken()` blocks until
 * a token becomes available.
 */
export class TokenBucketRateLimiter {
	private readonly capacity: number;
	private readonly refillRate: number;
	private readonly clock: Clock;
	private tokens: number;
	private lastRefillMs: number;

	private _hits = 0;
	private _misses = 0;
	private _waits = 0;
	private _totalWaitMs = 0;

	constructor(config: RateLimiterConfig) {
		if (config.capacity < 1) {
			throw new ConfigError("capacity must be >= 1", { capacity: config.capacity });
		}
		if (config.refillRate < 0) {
			throw new ConfigError("refillRate must be >= 0", { refillRate: config.refillRate });
		}
		this.capacity = config.capacity;
		this.refillRate = config.refillRate;
		this.clock = config.clock;
		this.tokens = config.capacity;
		this.lastRefillMs = this.clock.now();
	}

	/**
	 * Attempts to acquire one token without blocking.
	 * @returns true if a token was acquired, false otherwise.
	 * @example
	 * if (limiter.tryAcquire()) {
	 *   // proceed with request
	 * }
	 */
	tryAcquire(): boolean {
		const acquired = this.rawTryAcquire();
		if (acquired) {
			this._hits++;
		} else {
			this._misses++;
		}
		return acquired;
	}

	/** Acquires a token without updating stats. Used internally by waitForToken polling. */
	private rawTryAcquire(): boolean {
		this.refill();
		if (this.tokens >= 1) {
			this.tokens -= 1;
			return true;
		}
		return false;
	}

	/**
	 * Returns the current number of available tokens (after refill).
	 * @returns Number of tokens available (floored to integer).
	 */
	availableTokens(): number {
		this.refill();
		return Math.floor(this.tokens);
	}

	/**
	 * Returns the time in milliseconds until the next token becomes available.
	 * @returns 0 if tokens are available now, Infinity if refillRate is 0
	 * and no tokens are available, otherwise milliseconds to wait.
	 */
	timeUntilNextTokenMs(): number {
		this.refill();
		if (this.tokens >= 1) {
			return 0;
		}
		if (this.refillRate === 0) {
			return Number.POSITIVE_INFINITY;
		}
		return Math.ceil(((1 - this.tokens) / this.refillRate) * 1000);
	}

	/**
	 * Waits until a token becomes available, then acquires it.
	 * @param timeoutMs - Maximum time to wait for a token (default: 30000ms)
	 * @returns Promise that resolves when a token is acquired.
	 * @throws RateLimitError if timeout expires before token becomes available.
	 */
	waitForToken(timeoutMs = 30000): Promise<void> {
		if (this.rawTryAcquire()) {
			this._hits++;
			return Promise.resolve();
		}

		const startMs = this.clock.now();
		this._waits++;

		return new Promise<void>((resolve, reject) => {
			const interval = setInterval(() => {
				const elapsed = this.clock.now() - startMs;
				if (this.rawTryAcquire()) {
					clearInterval(interval);
					this._hits++;
					this._totalWaitMs += elapsed;
					resolve();
				} else if (elapsed >= timeoutMs) {
					clearInterval(interval);
					reject(new RateLimitError("Timeout waiting for rate limit token", timeoutMs));
				}
			}, 10);
		});
	}

	/** Returns a snapshot of rate limiter usage statistics. */
	getStats(): RateLimiterStats {
		return {
			hits: this._hits,
			misses: this._misses,
			waits: this._waits,
			avgWaitMs: this._waits > 0 ? this._totalWaitMs / this._waits : 0,
		};
	}

	/** Resets all usage statistics counters to zero. */
	resetStats(): void {
		this._hits = 0;
		this._misses = 0;
		this._waits = 0;
		this._totalWaitMs = 0;
	}

	private refill(): void {
		const now = this.clock.now();
		const elapsedMs = now - this.lastRefillMs;
		if (elapsedMs <= 0) return;

		const newTokens = (elapsedMs / 1000) * this.refillRate;
		this.tokens = Math.min(this.capacity, this.tokens + newTokens);
		this.lastRefillMs = now;
	}
}
