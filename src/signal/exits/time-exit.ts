import type { DetectorContextLike, ExitPolicy, ExitReason, PositionLike } from "../types.js";

/**
 * Exit policy that closes positions when remaining market time falls below a threshold.
 * Prevents holding through low-liquidity end-of-market periods.
 *
 * @example
 * ```ts
 * const exit = TimeExit.normal(); // exit with 5 minutes remaining
 * const reason = exit.shouldExit(position, ctx);
 * ```
 */
export class TimeExit implements ExitPolicy {
	readonly name = "TimeExit";
	private readonly minRemainingMs: number;

	private constructor(minRemainingMs: number) {
		this.minRemainingMs = minRemainingMs;
	}

	/**
	 * Creates a time exit with a custom minimum remaining time.
	 * @param minRemainingMs Minimum remaining time in milliseconds
	 */
	static create(minRemainingMs: number): TimeExit {
		return new TimeExit(minRemainingMs);
	}

	/**
	 * Creates a time exit from seconds.
	 * @param secs Minimum remaining time in seconds
	 */
	static fromSecs(secs: number): TimeExit {
		return new TimeExit(secs * 1_000);
	}

	/**
	 * Creates a time exit from minutes.
	 * @param mins Minimum remaining time in minutes
	 */
	static fromMins(mins: number): TimeExit {
		return new TimeExit(mins * 60_000);
	}

	/** Creates a short time exit with 2 minutes remaining. */
	static short(): TimeExit {
		return TimeExit.fromMins(2);
	}

	/** Creates a normal time exit with 5 minutes remaining. */
	static normal(): TimeExit {
		return TimeExit.fromMins(5);
	}

	/** Creates a long time exit with 10 minutes remaining. */
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
