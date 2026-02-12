import type { DetectorContextLike, ExitPolicy, ExitReason, PositionLike } from "../types.js";

export class TimeExit implements ExitPolicy {
	readonly name = "TimeExit";
	private readonly minRemainingMs: number;

	private constructor(minRemainingMs: number) {
		this.minRemainingMs = minRemainingMs;
	}

	static create(minRemainingMs: number): TimeExit {
		return new TimeExit(minRemainingMs);
	}

	static fromSecs(secs: number): TimeExit {
		return new TimeExit(secs * 1_000);
	}

	static fromMins(mins: number): TimeExit {
		return new TimeExit(mins * 60_000);
	}

	static short(): TimeExit {
		return TimeExit.fromMins(2);
	}

	static normal(): TimeExit {
		return TimeExit.fromMins(5);
	}

	static long(): TimeExit {
		return TimeExit.fromMins(10);
	}

	shouldExit(_position: PositionLike, ctx: DetectorContextLike): ExitReason | null {
		const remaining = ctx.timeRemainingMs();
		if (remaining <= this.minRemainingMs) {
			return { type: "time_exit", remainingSecs: remaining / 1_000 };
		}
		return null;
	}
}
