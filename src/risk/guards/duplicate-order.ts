import { MarketSide } from "../../shared/market-side.js";
import type { EntryGuard, GuardContext, GuardVerdict } from "../types.js";
import { allow, block } from "../types.js";

/**
 * Guard that prevents duplicate orders for the same market.
 * Blocks orders if a pending order already exists for either side of the market.
 */
export class DuplicateOrderGuard implements EntryGuard {
	readonly name = "DuplicateOrder";

	check(ctx: GuardContext): GuardVerdict {
		if (
			ctx.hasPendingOrderFor(ctx.conditionId, MarketSide.Yes) ||
			ctx.hasPendingOrderFor(ctx.conditionId, MarketSide.No)
		) {
			return block(this.name, "pending order already exists for this market");
		}
		return allow();
	}
}
