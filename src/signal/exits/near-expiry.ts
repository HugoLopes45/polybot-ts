import type { DetectorContextLike, ExitPolicy, ExitReason, PositionLike } from "../types.js";

/**
 * Exit policy that closes positions when the market is about to expire.
 * Similar to TimeExit but focused on contract expiration rather than session time.
 *
 * @example
 * ```ts
 * const exit = NearExpiryExit.normal(); // exit within 60s of expiry
 * const reason = exit.shouldExit(position, ctx);
 * ```
 */
export class NearExpiryExit implements ExitPolicy {
	readonly name = "NearExpiry";
	private readonly exitWithinMs: number;

	private constructor(exitWithinMs: number) {
		this.exitWithinMs = exitWithinMs;
	}

	/**
	 * Creates a near-expiry exit with a custom time window.
	 * @param exitWithinMs Time window before expiry in milliseconds
	 */
	static create(exitWithinMs: number): NearExpiryExit {
		return new NearExpiryExit(exitWithinMs);
	}

	/**
	 * Creates a near-expiry exit from seconds.
	 * @param secs Time window before expiry in seconds
	 */
	static fromSecs(secs: number): NearExpiryExit {
		return new NearExpiryExit(secs * 1_000);
	}

	/** Creates a short near-expiry exit with 30 seconds before expiry. */
	static short(): NearExpiryExit {
		return NearExpiryExit.fromSecs(30);
	}

	/** Creates a normal near-expiry exit with 60 seconds before expiry. */
	static normal(): NearExpiryExit {
		return NearExpiryExit.fromSecs(60);
	}

	/** Creates a long near-expiry exit with 120 seconds before expiry. */
	static long(): NearExpiryExit {
		return NearExpiryExit.fromSecs(120);
	}

	shouldExit(_position: PositionLike, ctx: DetectorContextLike): ExitReason | null {
		const remaining = ctx.timeRemainingMs();
		if (remaining <= this.exitWithinMs) {
			return { type: "near_expiry", remainingSecs: remaining / 1_000 };
		}
		return null;
	}
}
