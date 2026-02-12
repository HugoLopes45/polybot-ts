import type { EntryGuard, GuardContext, GuardVerdict } from "../types.js";
import { allow, block } from "../types.js";

/**
 * Guard that limits the number of orders per market to prevent overexposure.
 * Tracks order counts per condition ID and blocks new orders when limit is exceeded.
 */
export class PerMarketLimitGuard implements EntryGuard {
	readonly name = "PerMarketLimit";
	private readonly maxOrdersPerMarket: number;
	private readonly marketCounts: Map<string, number>;

	private constructor(maxOrdersPerMarket: number) {
		this.maxOrdersPerMarket = maxOrdersPerMarket;
		this.marketCounts = new Map();
	}

	/**
	 * Creates a new PerMarketLimitGuard with the specified order limit.
	 * @param maxOrdersPerMarket - Maximum number of orders allowed per market
	 * @example
	 * const guard = PerMarketLimitGuard.create(3);
	 */
	static create(maxOrdersPerMarket: number): PerMarketLimitGuard {
		return new PerMarketLimitGuard(maxOrdersPerMarket);
	}

	/**
	 * Records an order for a market, incrementing its count.
	 * @param conditionId - The market/condition identifier
	 */
	recordOrder(conditionId: string): void {
		const count = this.marketCounts.get(conditionId) ?? 0;
		this.marketCounts.set(conditionId, count + 1);
	}

	/**
	 * Resets the order count for a specific market.
	 * @param conditionId - The market/condition identifier
	 */
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
