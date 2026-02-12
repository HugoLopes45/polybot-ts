import type { DetectorContextLike, ExitPolicy, ExitReason, PositionLike } from "../types.js";

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

	static create(opts: {
		minTimeRemainingMs?: number;
		maxHoldTimeMs?: number;
		maxSpreadPct?: number;
	}): EmergencyExit {
		return new EmergencyExit(opts);
	}

	static conservative(): EmergencyExit {
		return new EmergencyExit({
			minTimeRemainingMs: 120_000,
			maxHoldTimeMs: 3_600_000,
		});
	}

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
