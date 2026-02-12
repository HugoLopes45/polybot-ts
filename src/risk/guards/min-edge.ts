import { MarketSide } from "../../shared/market-side.js";
import type { EntryGuard, GuardContext, GuardVerdict } from "../types.js";
import { allow, blockWithValues } from "../types.js";

export class MinEdgeGuard implements EntryGuard {
	readonly name = "MinEdge";
	private readonly minEdgePct: number;

	private constructor(minEdgePct: number) {
		this.minEdgePct = minEdgePct;
	}

	static create(minEdgePct: number): MinEdgeGuard {
		return new MinEdgeGuard(minEdgePct);
	}

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
