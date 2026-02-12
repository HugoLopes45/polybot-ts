import { MarketSide } from "../../shared/market-side.js";
import type { EntryGuard, GuardContext, GuardVerdict } from "../types.js";
import { allow, blockWithValues } from "../types.js";

export class MaxSpreadGuard implements EntryGuard {
	readonly name = "MaxSpread";
	private readonly maxSpreadPct: number;

	private constructor(maxSpreadPct: number) {
		this.maxSpreadPct = maxSpreadPct;
	}

	static create(maxSpreadPct: number): MaxSpreadGuard {
		return new MaxSpreadGuard(maxSpreadPct);
	}

	static fromPct(pct: number): MaxSpreadGuard {
		return new MaxSpreadGuard(pct);
	}

	static tight(): MaxSpreadGuard {
		return new MaxSpreadGuard(3);
	}

	static normal(): MaxSpreadGuard {
		return new MaxSpreadGuard(5);
	}

	static wide(): MaxSpreadGuard {
		return new MaxSpreadGuard(10);
	}

	check(ctx: GuardContext): GuardVerdict {
		const spreadPct = ctx.spreadPct(MarketSide.Yes);
		if (spreadPct === null) return allow();

		if (spreadPct > this.maxSpreadPct) {
			return blockWithValues(this.name, "spread too wide", spreadPct, this.maxSpreadPct);
		}
		return allow();
	}
}
