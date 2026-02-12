import { MarketSide } from "../../shared/market-side.js";
import type { EntryGuard, GuardContext, GuardVerdict } from "../types.js";
import { allow, block } from "../types.js";

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
