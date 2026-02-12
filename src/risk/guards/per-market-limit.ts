import type { EntryGuard, GuardContext, GuardVerdict } from "../types.js";
import { allow, block } from "../types.js";

export class PerMarketLimitGuard implements EntryGuard {
	readonly name = "PerMarketLimit";
	private readonly maxOrdersPerMarket: number;
	private readonly marketCounts: Map<string, number>;

	private constructor(maxOrdersPerMarket: number) {
		this.maxOrdersPerMarket = maxOrdersPerMarket;
		this.marketCounts = new Map();
	}

	static create(maxOrdersPerMarket: number): PerMarketLimitGuard {
		return new PerMarketLimitGuard(maxOrdersPerMarket);
	}

	recordOrder(conditionId: string): void {
		const count = this.marketCounts.get(conditionId) ?? 0;
		this.marketCounts.set(conditionId, count + 1);
	}

	resetMarket(conditionId: string): void {
		this.marketCounts.delete(conditionId);
	}

	check(ctx: GuardContext): GuardVerdict {
		const id = ctx.conditionId as string;
		const count = this.marketCounts.get(id) ?? 0;
		if (count >= this.maxOrdersPerMarket) {
			return block(
				this.name,
				`market ${id} has ${count} orders (limit: ${this.maxOrdersPerMarket})`,
			);
		}
		return allow();
	}
}
