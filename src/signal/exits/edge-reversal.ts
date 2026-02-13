import { MarketSide } from "../../shared/market-side.js";
import type { DetectorContextLike, ExitPolicy, ExitReason, PositionLike } from "../types.js";

/**
 * Exit policy that closes positions when the trading edge reverses.
 * Monitors oracle fair value vs entry price and exits if the edge flips
 * beyond a threshold — the signal that originally justified the trade is gone.
 *
 * @example
 * ```ts
 * const exit = EdgeReversalExit.normal(); // 5% reversal threshold
 * const reason = exit.shouldExit(position, ctx);
 * ```
 */
export class EdgeReversalExit implements ExitPolicy {
	readonly name = "EdgeReversal";
	private readonly reversalThreshold: number;

	private constructor(reversalThreshold: number) {
		this.reversalThreshold = reversalThreshold;
	}

	/**
	 * Creates an edge reversal exit with a custom reversal threshold.
	 * @param threshold Reversal threshold (e.g., 0.05 for 5%)
	 */
	static create(threshold: number): EdgeReversalExit {
		return new EdgeReversalExit(threshold);
	}

	/**
	 * Creates an edge reversal exit from a percentage.
	 * @param pct Reversal threshold as a percentage (e.g., 5 for 5%)
	 */
	static fromPct(pct: number): EdgeReversalExit {
		return new EdgeReversalExit(pct / 100);
	}

	/** Creates a tight edge reversal exit with 3% reversal threshold. */
	static tight(): EdgeReversalExit {
		return EdgeReversalExit.fromPct(3);
	}

	/** Creates a normal edge reversal exit with 5% reversal threshold. */
	static normal(): EdgeReversalExit {
		return EdgeReversalExit.fromPct(5);
	}

	/** Creates a wide edge reversal exit with 10% reversal threshold. */
	static wide(): EdgeReversalExit {
		return EdgeReversalExit.fromPct(10);
	}

	shouldExit(position: PositionLike, ctx: DetectorContextLike): ExitReason | null {
		const oracleFv = ctx.oraclePrice();
		if (oracleFv === null) return null;

		const fv = oracleFv.toNumber();
		const entry = position.entryPrice.toNumber();

		if (position.side === MarketSide.Yes) {
			if (fv < entry - this.reversalThreshold) {
				return { type: "edge_reversal", newEdge: fv - entry };
			}
		} else {
			const noEntry = 1 - entry;
			if (fv > noEntry + this.reversalThreshold) {
				return { type: "edge_reversal", newEdge: noEntry - fv };
			}
		}
		return null;
	}
}
