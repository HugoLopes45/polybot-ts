import { MarketSide } from "../../shared/market-side.js";
import type { DetectorContextLike, ExitPolicy, ExitReason, PositionLike } from "../types.js";

export class EdgeReversalExit implements ExitPolicy {
	readonly name = "EdgeReversal";
	private readonly reversalThreshold: number;

	private constructor(reversalThreshold: number) {
		this.reversalThreshold = reversalThreshold;
	}

	static create(threshold: number): EdgeReversalExit {
		return new EdgeReversalExit(threshold);
	}

	static fromPct(pct: number): EdgeReversalExit {
		return new EdgeReversalExit(pct / 100);
	}

	static tight(): EdgeReversalExit {
		return EdgeReversalExit.fromPct(3);
	}

	static normal(): EdgeReversalExit {
		return EdgeReversalExit.fromPct(5);
	}

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
