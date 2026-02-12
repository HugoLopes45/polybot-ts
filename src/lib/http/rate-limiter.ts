import type { Clock } from "../../shared/time.js";

/**
 * Configuration for TokenBucketRateLimiter.
 */
export interface RateLimiterConfig {
	readonly capacity: number;
	readonly refillRate: number;
	readonly clock: Clock;
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
		if (this.tryAcquire()) {
			return Promise.resolve();
		}

		return new Promise<void>((resolve) => {
			const interval = setInterval(() => {
				if (this.tryAcquire()) {
					clearInterval(interval);
					resolve();
				}
			}, 10);
		});
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
