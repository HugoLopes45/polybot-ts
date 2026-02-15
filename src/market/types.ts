import type { Decimal } from "../shared/decimal.js";
import type { ConditionId } from "../shared/identifiers.js";

/**
 * A single price level in an orderbook.
 */
export interface OrderbookLevel {
	readonly price: Decimal;
	readonly size: Decimal;
}

/**
 * A complete snapshot of the orderbook state at a point in time.
 * Contains all bids and asks with their respective prices and sizes.
 */
export interface OrderbookSnapshot {
	readonly bids: readonly OrderbookLevel[];
	readonly asks: readonly OrderbookLevel[];
	readonly timestampMs: number;
}

/**
 * A delta update to apply to an orderbook snapshot.
 * Represents changes in bids and/or asks since the last snapshot.
 */
export interface OrderbookDelta {
	readonly bids: readonly OrderbookLevel[];
	readonly asks: readonly OrderbookLevel[];
}

/**
 * Information about a tradable market/condition.
 */
export interface MarketInfo {
	readonly conditionId: ConditionId;
	readonly questionId: string;
	readonly question: string;
	readonly description: string;
	readonly active: boolean;
	readonly closed: boolean;
	readonly endDate: string;
}

/**
 * Result of scanning a market for trading opportunities.
 * Contains the calculated edge, spread, and a composite score.
 */
export interface ScanResult {
	readonly conditionId: ConditionId;
	readonly edge: Decimal;
	readonly spread: Decimal;
	readonly score: number;
}

/**
 * Detailed profit breakdown for an arbitrage opportunity.
 *
 * Invariants (maintained by `calcArbProfit`):
 * - net = gross - totalFees
 * - roiPct = (net / totalCost) * 100
 * - totalFees >= 0
 */
export interface ArbProfitBreakdown {
	readonly gross: Decimal;
	readonly totalCost: Decimal;
	readonly totalFees: Decimal;
	readonly net: Decimal;
	readonly roiPct: Decimal;
}
