import type { EntryGuard, GuardContext, GuardVerdict } from "../types.js";
import { allow, blockWithValues } from "../types.js";

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

	static create(maxPerWindow: number, windowMs: number): RateLimitGuard {
		return new RateLimitGuard(maxPerWindow, windowMs);
	}

	static perMinute(max: number): RateLimitGuard {
		return new RateLimitGuard(max, 60_000);
	}

	static perSecond(max: number): RateLimitGuard {
		return new RateLimitGuard(max, 1_000);
	}

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
