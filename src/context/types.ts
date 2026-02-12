/**
 * DetectorContext sub-view interfaces (ISP).
 *
 * Each view exposes only the subset of context needed by specific consumers:
 * - MarketView: orderbook data for spread/price checks
 * - PositionView: open positions and balances
 * - OracleView: oracle fair value and indicators
 * - StateView: strategy lifecycle state
 * - RiskView: daily P&L and loss tracking
 */

import type { StrategyState } from "../lifecycle/types.js";
import type { SdkPosition } from "../position/sdk-position.js";
import type { Decimal } from "../shared/decimal.js";
import type { ConditionId } from "../shared/identifiers.js";
import type { MarketSide } from "../shared/market-side.js";

// ── ISP sub-views ───────────────────────────────────────────────────

export interface MarketView {
	bestBid(side: MarketSide): Decimal | null;
	bestAsk(side: MarketSide): Decimal | null;
	spread(side: MarketSide): Decimal | null;
	spreadPct(side: MarketSide): number | null;
	timeRemainingMs(): number;
}

export interface PositionView {
	positions(): readonly SdkPosition[];
	hasPosition(conditionId: ConditionId): boolean;
	openCount(): number;
	totalNotional(): Decimal;
}

export interface OracleView {
	oraclePrice(): Decimal | null;
	oracleAgeMs(): number | null;
	oracleIsFresh(maxAgeMs: number): boolean;
}

export interface StateView {
	state(): StrategyState;
	canOpen(): boolean;
	canClose(): boolean;
}

export interface RiskView {
	dailyPnl(): Decimal;
	consecutiveLosses(): number;
	availableBalance(): Decimal;
}
