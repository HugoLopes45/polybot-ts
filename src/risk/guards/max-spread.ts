import { MarketSide } from "../../shared/market-side.js";
import type { EntryGuard, GuardContext, GuardVerdict } from "../types.js";
import { allow, blockWithValues } from "../types.js";

/**
 * Guard that blocks trades when the market spread exceeds a threshold.
 * Ensures trades only execute in liquid markets with reasonable prices.
 *
 * @example
 * ```ts
 * const guard = MaxSpreadGuard.normal(); // 5% max spread
 * const verdict = guard.check(ctx);
 * ```
 */
export class MaxSpreadGuard implements EntryGuard {
	readonly name = "MaxSpread";
	private readonly maxSpreadPct: number;

	private constructor(maxSpreadPct: number) {
		this.maxSpreadPct = maxSpreadPct;
	}

	/**
	 * Creates a guard with the specified maximum spread percentage.
	 * @param maxSpreadPct - Maximum allowed spread percentage
	 */
	static create(maxSpreadPct: number): MaxSpreadGuard {
		return new MaxSpreadGuard(maxSpreadPct);
	}

	/**
	 * Creates a guard with the specified maximum spread percentage.
	 * @param pct - Maximum allowed spread percentage
	 */
	static fromPct(pct: number): MaxSpreadGuard {
		return new MaxSpreadGuard(pct);
	}

	/**
	 * Creates a tight spread guard with 3% maximum spread.
	 */
	static tight(): MaxSpreadGuard {
		return new MaxSpreadGuard(3);
	}

	/**
	 * Creates a normal spread guard with 5% maximum spread.
	 */
	static normal(): MaxSpreadGuard {
		return new MaxSpreadGuard(5);
	}

	/**
	 * Creates a wide spread guard with 10% maximum spread.
	 */
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
