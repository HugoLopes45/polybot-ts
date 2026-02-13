import type { DetectorContextLike, ExitPolicy, ExitReason, PositionLike } from "../types.js";

/**
 * Exit policy that closes positions under emergency conditions.
 * Configurable triggers: minimum time remaining, maximum hold duration,
 * and maximum spread. Acts as a safety net when other exits don't fire.
 *
 * @example
 * ```ts
 * const exit = EmergencyExit.conservative(); // 2min remaining, 1h max hold
 * const reason = exit.shouldExit(position, ctx);
 * ```
 */
export class EmergencyExit implements ExitPolicy {
	readonly name = "Emergency";
	private readonly minTimeRemainingMs: number | null;
	private readonly maxHoldTimeMs: number | null;
	private readonly maxSpreadPct: number | null;

	private constructor(opts: {
		minTimeRemainingMs?: number;
		maxHoldTimeMs?: number;
		maxSpreadPct?: number;
	}) {
		this.minTimeRemainingMs = opts.minTimeRemainingMs ?? null;
		this.maxHoldTimeMs = opts.maxHoldTimeMs ?? null;
		this.maxSpreadPct = opts.maxSpreadPct ?? null;
	}

	/**
	 * Creates an emergency exit with custom triggers.
	 * @param opts Configuration with optional minTimeRemainingMs, maxHoldTimeMs, maxSpreadPct
	 */
	static create(opts: {
		minTimeRemainingMs?: number;
		maxHoldTimeMs?: number;
		maxSpreadPct?: number;
	}): EmergencyExit {
		return new EmergencyExit(opts);
	}

	/** Creates a conservative emergency exit with 2 minutes remaining and 1 hour max hold. */
	static conservative(): EmergencyExit {
		return new EmergencyExit({
			minTimeRemainingMs: 120_000,
			maxHoldTimeMs: 3_600_000,
		});
	}

	/** Creates an aggressive emergency exit with 30 seconds remaining and 30 minutes max hold. */
	static aggressive(): EmergencyExit {
		return new EmergencyExit({
			minTimeRemainingMs: 30_000,
			maxHoldTimeMs: 1_800_000,
		});
	}

	shouldExit(position: PositionLike, ctx: DetectorContextLike): ExitReason | null {
		if (this.minTimeRemainingMs !== null) {
			const remaining = ctx.timeRemainingMs();
			if (remaining <= this.minTimeRemainingMs) {
				return { type: "emergency", reason: `time_remaining=${Math.round(remaining / 1000)}s` };
			}
		}

		if (this.maxHoldTimeMs !== null) {
			const held = ctx.nowMs() - position.entryTimeMs;
			if (held >= this.maxHoldTimeMs) {
				return { type: "emergency", reason: `hold_time=${Math.round(held / 1000)}s` };
			}
		}

		if (this.maxSpreadPct !== null) {
			const spread = ctx.spread(position.side);
			if (spread !== null && spread.toNumber() > this.maxSpreadPct) {
				return { type: "emergency", reason: `spread=${spread.toFixed(4)}` };
			}
		}

		return null;
	}
}
