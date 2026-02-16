import type { DetectorContextLike, ExitPolicy, ExitReason, PositionLike } from "../types.js";

/**
 * Exit policy that closes positions after a maximum hold duration.
 * Useful for strategies that want to avoid holding positions through specific time windows
 * or enforce time-based turnover.
 *
 * @example
 * ```ts
 * const exit = MaxHoldTimeExit.create(3600_000); // 1 hour max hold
 * const reason = exit.shouldExit(position, ctx);
 * ```
 */
export class MaxHoldTimeExit implements ExitPolicy {
	readonly name = "MaxHoldTime";
	private readonly maxHoldMs: number;

	private constructor(maxHoldMs: number) {
		this.maxHoldMs = maxHoldMs;
	}

	/**
	 * Creates a new MaxHoldTimeExit with the specified maximum hold duration.
	 * @param maxHoldMs Maximum duration in milliseconds to hold a position
	 */
	static create(maxHoldMs: number): MaxHoldTimeExit {
		return new MaxHoldTimeExit(maxHoldMs);
	}

	shouldExit(position: PositionLike, ctx: DetectorContextLike): ExitReason | null {
		const holdDurationMs = ctx.nowMs() - position.entryTimeMs;

		if (holdDurationMs > this.maxHoldMs) {
			return { type: "time_exit", remainingSecs: 0 };
		}

		return null;
	}
}
