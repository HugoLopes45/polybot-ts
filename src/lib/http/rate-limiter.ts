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
	 * Waits until a token becomes available, then acquires it.
	 * @returns Promise that resolves when a token is acquired.
	 */
	waitForToken(): Promise<void> {
		if (this.rawTryAcquire()) {
			this._hits++;
			return Promise.resolve();
		}

		const startMs = this.clock.now();
		this._waits++;

		return new Promise<void>((resolve) => {
			const interval = setInterval(() => {
				if (this.rawTryAcquire()) {
					clearInterval(interval);
					this._hits++;
					this._totalWaitMs += this.clock.now() - startMs;
					resolve();
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
