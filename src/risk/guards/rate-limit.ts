import type { EntryGuard, GuardContext, GuardVerdict } from "../types.js";
import { allow, blockWithValues } from "../types.js";

/**
 * Guard that blocks trades when order submission rate exceeds a threshold.
 * Uses a sliding window to track order timestamps and enforce rate limits.
 *
 * @example
 * ```ts
 * const guard = RateLimitGuard.perMinute(10); // max 10 orders per minute
 * guard.recordOrder(Date.now()); // call after each order
 * const verdict = guard.check(ctx);
 * ```
 */
export class RateLimitGuard implements EntryGuard {
	readonly name = "RateLimit";
	private readonly maxPerWindowMs: number;
	private readonly windowMs: number;
	private readonly timestamps: number[];

	private constructor(maxPerWindow: number, windowMs: number) {
		this.maxPerWindowMs = maxPerWindow;
		this.windowMs = windowMs;
		this.timestamps = [];
	}

	/**
	 * Creates a guard with the specified rate limit.
	 * @param maxPerWindow - Maximum orders allowed within the window
	 * @param windowMs - Window duration in milliseconds
	 */
	static create(maxPerWindow: number, windowMs: number): RateLimitGuard {
		return new RateLimitGuard(maxPerWindow, windowMs);
	}

	/**
	 * Creates a guard allowing at most `max` orders per minute.
	 * @param max - Maximum orders per minute
	 */
	static perMinute(max: number): RateLimitGuard {
		return new RateLimitGuard(max, 60_000);
	}

	/**
	 * Creates a guard allowing at most `max` orders per second.
	 * @param max - Maximum orders per second
	 */
	static perSecond(max: number): RateLimitGuard {
		return new RateLimitGuard(max, 1_000);
	}

	/**
	 * Records an order timestamp for rate tracking.
	 * @param nowMs - Timestamp of the order in milliseconds
	 */
	recordOrder(nowMs: number): void {
		this.timestamps.push(nowMs);
	}

	check(ctx: GuardContext): GuardVerdict {
		const now = ctx.nowMs();
		const cutoff = now - this.windowMs;

		while (this.timestamps.length > 0 && (this.timestamps[0] ?? 0) < cutoff) {
			this.timestamps.shift();
		}

		if (this.timestamps.length >= this.maxPerWindowMs) {
			return blockWithValues(
				this.name,
				"rate limit exceeded",
				this.timestamps.length,
				this.maxPerWindowMs,
			);
		}
		return allow();
	}
}
