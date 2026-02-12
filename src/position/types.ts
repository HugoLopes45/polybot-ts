/**
 * Position domain types.
 */

import type { Decimal } from "../shared/decimal.js";
import type { ConditionId, MarketTokenId } from "../shared/identifiers.js";
import type { MarketSide } from "../shared/market-side.js";

/** Serializable snapshot of a position's state at a point in time. */
export interface PositionSnapshot {
	readonly conditionId: ConditionId;
	readonly tokenId: MarketTokenId;
	readonly side: MarketSide;
	readonly entryPrice: Decimal;
	readonly size: Decimal;
	readonly costBasis: Decimal;
	readonly realizedPnl: Decimal;
	readonly highWaterMark: Decimal;
	readonly entryTimeMs: number;
}

/** Record of a position that has been fully closed, with realized P&L. */
export interface ClosedPosition {
	readonly snapshot: PositionSnapshot;
	readonly exitPrice: Decimal;
	readonly realizedPnl: Decimal;
	readonly closedAtMs: number;
}
