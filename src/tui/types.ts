import type { Decimal } from "../shared/decimal.js";
import type { ConditionId } from "../shared/identifiers.js";
import type { Clock } from "../shared/time.js";

export interface DashboardConfig {
	/** Refresh interval in ms. Must be > 0. */
	readonly refreshIntervalMs?: number;
	/** Maximum number of retained alerts. Must be >= 0. */
	readonly maxAlerts?: number;
	/** Clock source for timestamps and uptime calculation. */
	readonly clock?: Clock;
}

export interface PositionRow {
	readonly conditionId: ConditionId;
	readonly side: "BUY" | "SELL";
	readonly size: Decimal;
	readonly entryPrice: Decimal;
	readonly unrealizedPnl: Decimal;
}

export interface TradeRow {
	readonly conditionId: ConditionId;
	readonly side: "BUY" | "SELL";
	readonly price: Decimal;
	readonly size: Decimal;
	readonly timestamp: number;
}

export interface AlertEntry {
	readonly message: string;
	readonly level: "info" | "warn" | "error";
	readonly timestamp: number;
}

export interface DashboardStats {
	readonly uptimeMs: number;
	readonly positions: readonly PositionRow[];
	readonly recentTrades: readonly TradeRow[];
	readonly alerts: readonly AlertEntry[];
	readonly portfolioValue: Decimal;
	readonly dailyPnl: Decimal;
	readonly winRate: number;
	readonly tickLatencyP50Ms: number;
	readonly tickLatencyP99Ms: number;
}
