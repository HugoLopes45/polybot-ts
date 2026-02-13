import { Decimal } from "../../shared/decimal.js";
import type { DetectorContextLike, ExitPolicy, ExitReason, PositionLike } from "../types.js";

/**
 * Exit policy that closes positions when drawdown from high-water mark exceeds a threshold.
 * Captures gains by trailing the price upward and exiting on pullback.
 *
 * @example
 * ```ts
 * const exit = TrailingStopExit.normal(); // 10% trailing stop
 * const reason = exit.shouldExit(position, ctx);
 * ```
 */
export class TrailingStopExit implements ExitPolicy {
	readonly name = "TrailingStop";
	private readonly trailPct: Decimal;

	private constructor(trailPct: Decimal) {
		this.trailPct = trailPct;
	}

	/**
	 * Creates a trailing stop exit with a custom drawdown threshold.
	 * @param trailPct Drawdown threshold (e.g., 0.10 for 10%)
	 */
	static create(trailPct: Decimal): TrailingStopExit {
		return new TrailingStopExit(trailPct);
	}

	/**
	 * Creates a trailing stop exit from a percentage.
	 * @param pct Drawdown threshold as a percentage (e.g., 10 for 10%)
	 */
	static fromPct(pct: number): TrailingStopExit {
		return new TrailingStopExit(Decimal.from(pct / 100));
	}

	/** Creates a tight trailing stop with 5% drawdown threshold. */
	static tight(): TrailingStopExit {
		return TrailingStopExit.fromPct(5);
	}

	/** Creates a normal trailing stop with 10% drawdown threshold. */
	static normal(): TrailingStopExit {
		return TrailingStopExit.fromPct(10);
	}

	/** Creates a wide trailing stop with 20% drawdown threshold. */
	static wide(): TrailingStopExit {
		return TrailingStopExit.fromPct(20);
	}

	shouldExit(position: PositionLike, ctx: DetectorContextLike): ExitReason | null {
		const currentPrice = ctx.bestBid(position.side);
		if (currentPrice === null) return null;

		const dd = position.drawdown(currentPrice);
		if (dd.gte(this.trailPct)) {
			return { type: "trailing_stop", drawdownPct: dd };
		}
		return null;
	}
}
