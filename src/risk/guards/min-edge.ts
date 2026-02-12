import { MarketSide } from "../../shared/market-side.js";
import type { EntryGuard, GuardContext, GuardVerdict } from "../types.js";
import { allow, blockWithValues } from "../types.js";

/**
 * Guard that validates minimum edge requirement before placing orders.
 * Computes edge as (oraclePrice - bestAsk) / bestAsk and requires it to exceed threshold.
 */
export class MinEdgeGuard implements EntryGuard {
	readonly name = "MinEdge";
	private readonly minEdgePct: number;

	private constructor(minEdgePct: number) {
		this.minEdgePct = minEdgePct;
	}

	/**
	 * Creates a new MinEdgeGuard with the specified minimum edge.
	 * @param minEdgePct - Minimum edge percentage required (e.g., 2 for 2%)
	 * @example
	 * const guard = MinEdgeGuard.create(2.5);
	 */
	static create(minEdgePct: number): MinEdgeGuard {
		return new MinEdgeGuard(minEdgePct);
	}

	/**
	 * Creates a guard from a percentage value (e.g., 5 for 5%).
	 * @param pct - The minimum edge percentage
	 * @example
	 * const guard = MinEdgeGuard.fromPct(5);
	 */
	static fromPct(pct: number): MinEdgeGuard {
		return new MinEdgeGuard(pct);
	}

	check(ctx: GuardContext): GuardVerdict {
		const oracle = ctx.oraclePrice();
		const bestAsk = ctx.bestAsk(MarketSide.Yes);
		if (oracle === null || bestAsk === null) return allow();

		const edge = ((oracle.toNumber() - bestAsk.toNumber()) / bestAsk.toNumber()) * 100;
		if (edge < this.minEdgePct) {
			return blockWithValues(this.name, "insufficient edge", edge, this.minEdgePct);
		}
		return allow();
	}
}
