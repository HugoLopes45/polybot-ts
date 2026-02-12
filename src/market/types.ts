import type { Decimal } from "../shared/decimal.js";
import type { ConditionId } from "../shared/identifiers.js";

export interface OrderbookLevel {
	readonly price: Decimal;
	readonly size: Decimal;
}

export interface OrderbookSnapshot {
	readonly bids: readonly OrderbookLevel[];
	readonly asks: readonly OrderbookLevel[];
	readonly timestampMs: number;
}

export interface OrderbookDelta {
	readonly bids: readonly OrderbookLevel[];
	readonly asks: readonly OrderbookLevel[];
}

export interface MarketInfo {
	readonly conditionId: ConditionId;
	readonly questionId: string;
	readonly question: string;
	readonly description: string;
	readonly active: boolean;
	readonly closed: boolean;
	readonly endDate: string;
}

export interface ScanResult {
	readonly conditionId: ConditionId;
	readonly edge: Decimal;
	readonly spread: Decimal;
	readonly score: number;
}
