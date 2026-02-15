import type { Clock } from "../../shared/time.js";
import type { RateLimiterConfig, RateLimiterStats } from "./rate-limiter.js";
import { TokenBucketRateLimiter } from "./rate-limiter.js";

/**
 * Manages multiple named rate limiters sharing a single clock.
 *
 * Use {@link getOrCreate} to obtain a limiter for a given endpoint name,
 * creating one on first access with the supplied config.
 */
export class RateLimiterManager {
	private readonly clock: Clock;
	private readonly limiters: Map<string, TokenBucketRateLimiter> = new Map();

	constructor(clock: Clock) {
		this.clock = clock;
	}

	/**
	 * Returns an existing limiter or creates one with the given config.
	 *
	 * Note: First registration wins — subsequent calls with the same name return the
	 * existing limiter, ignoring the new config.
	 *
	 * @param name - Unique name for the rate limiter
	 * @param config - Configuration for the rate limiter (used only if creating)
	 * @returns The rate limiter instance (existing or newly created)
	 */
	getOrCreate(name: string, config: Omit<RateLimiterConfig, "clock">): TokenBucketRateLimiter {
		const existing = this.limiters.get(name);
		if (existing) return existing;
		const limiter = new TokenBucketRateLimiter({ ...config, clock: this.clock });
		this.limiters.set(name, limiter);
		return limiter;
	}

	/** Returns the limiter for the given name, or undefined if not registered. */
	get(name: string): TokenBucketRateLimiter | undefined {
		return this.limiters.get(name);
	}

	/** Returns true if a limiter with the given name exists. */
	has(name: string): boolean {
		return this.limiters.has(name);
	}

	/** Returns a snapshot of stats for all registered limiters. */
	getAllStats(): ReadonlyMap<string, RateLimiterStats> {
		const stats = new Map<string, RateLimiterStats>();
		for (const [name, limiter] of this.limiters) {
			stats.set(name, limiter.getStats());
		}
		return stats;
	}

	/** Resets stats on all registered limiters. */
	resetAll(): void {
		for (const limiter of this.limiters.values()) {
			limiter.resetStats();
		}
	}
}
