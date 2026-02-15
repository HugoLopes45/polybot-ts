/**
 * SDK Events — infrastructure-level events emitted by the trading engine.
 *
 * These capture "what happened" in the system: orders placed, fills received,
 * positions opened/closed, state changes. Used for internal bookkeeping,
 * logging, and testing assertions.
 */

import type { StrategyState } from "../lifecycle/types.js";
import type {
	ClientOrderId,
	ConditionId,
	ExchangeOrderId,
	MarketTokenId,
} from "../shared/identifiers.js";
import type { MarketSide } from "../shared/market-side.js";

export type SdkEvent =
	| OrderPlaced
	| OrderCancelled
	| FillReceived
	| PositionOpened
	| PositionClosed
	| PositionReduced
	| GuardBlocked
	| StateChanged
	| WatchdogAlert
	| ErrorOccurred
	| TickDropped;

// ── Event types ──────────────────────────────────────────────────────

export interface OrderPlaced {
	readonly type: "order_placed";
	readonly timestamp: number;
	readonly clientOrderId: ClientOrderId;
	readonly conditionId: ConditionId;
	readonly tokenId: MarketTokenId;
	readonly side: MarketSide;
	readonly price: number;
	readonly size: number;
}

export interface OrderCancelled {
	readonly type: "order_cancelled";
	readonly timestamp: number;
	readonly clientOrderId: ClientOrderId;
	readonly reason: string;
}

export interface FillReceived {
	readonly type: "fill_received";
	readonly timestamp: number;
	readonly clientOrderId: ClientOrderId;
	readonly exchangeOrderId: ExchangeOrderId;
	readonly price: number;
	readonly filledSize: number;
	readonly remainingSize: number;
	readonly fee: number;
}

export interface PositionOpened {
	readonly type: "position_opened";
	readonly timestamp: number;
	readonly conditionId: ConditionId;
	readonly tokenId: MarketTokenId;
	readonly side: MarketSide;
	readonly entryPrice: number;
	readonly size: number;
}

export interface PositionClosed {
	readonly type: "position_closed";
	readonly timestamp: number;
	readonly conditionId: ConditionId;
	readonly tokenId: MarketTokenId;
	readonly entryPrice: number;
	readonly exitPrice: number;
	readonly pnl: number;
	readonly reason: string;
	readonly fee?: number;
}

export interface PositionReduced {
	readonly type: "position_reduced";
	readonly timestamp: number;
	readonly conditionId: ConditionId;
	readonly tokenId: MarketTokenId;
	readonly oldSize: number;
	readonly newSize: number;
	readonly price: number;
}

export interface GuardBlocked {
	readonly type: "guard_blocked";
	readonly timestamp: number;
	readonly guardName: string;
	readonly reason: string;
	readonly recoverable: boolean;
	readonly currentValue?: number;
	readonly threshold?: number;
}

export interface StateChanged {
	readonly type: "state_changed";
	readonly timestamp: number;
	readonly from: StrategyState;
	readonly to: StrategyState;
	readonly transition: string;
}

export interface WatchdogAlert {
	readonly type: "watchdog_alert";
	readonly timestamp: number;
	readonly status: string;
	readonly silenceMs: number;
}

export interface ErrorOccurred {
	readonly type: "error_occurred";
	readonly timestamp: number;
	readonly code: string;
	readonly message: string;
	readonly category: string;
}

export interface TickDropped {
	readonly type: "tick_dropped";
	readonly timestamp: number;
	readonly reason: string;
}

// ── Type guard ───────────────────────────────────────────────────────

export type SdkEventType = SdkEvent["type"];
