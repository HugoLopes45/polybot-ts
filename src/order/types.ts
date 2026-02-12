/**
 * Order domain types.
 */

import type { Decimal } from "../shared/decimal.js";
import type {
	ClientOrderId,
	ConditionId,
	ExchangeOrderId,
	MarketTokenId,
} from "../shared/identifiers.js";

// ── Order kind ──────────────────────────────────────────────────────

/** Time-in-force behavior for orders (Good-Til-Cancelled, Immediate-Or-Cancel, etc.). */
export const OrderKind = {
	GTC: "gtc",
	IOC: "ioc",
	FOK: "fok",
	GTD: "gtd",
} as const;

/** OrderKind type: GTC | IOC | FOK | GTD */
export type OrderKind = (typeof OrderKind)[keyof typeof OrderKind];

// ── Pending state (7-state machine) ────────────────────────────────

/** 7-state lifecycle of an order, from creation to terminal (filled/cancelled/expired). */
export const PendingState = {
	Created: "created",
	Submitted: "submitted",
	Open: "open",
	PartiallyFilled: "partially_filled",
	Filled: "filled",
	Cancelled: "cancelled",
	Expired: "expired",
} as const;

/** PendingState type: Created | Submitted | Open | PartiallyFilled | Filled | Cancelled | Expired */
export type PendingState = (typeof PendingState)[keyof typeof PendingState];

// ── Cancel reason ───────────────────────────────────────────────────

/** Reason an order was cancelled -- used for diagnostics and event reporting. */
export const CancelReason = {
	UserRequested: "user_requested",
	Timeout: "timeout",
	InsufficientFunds: "insufficient_funds",
	MarketClosed: "market_closed",
	SubmissionFailed: "submission_failed",
	Exchange: "exchange",
} as const;

/** CancelReason type: UserRequested | Timeout | InsufficientFunds | MarketClosed | SubmissionFailed | Exchange */
export type CancelReason = (typeof CancelReason)[keyof typeof CancelReason];

// ── Order side ──────────────────────────────────────────────────────

/** Buy or sell side of an order. */
export const OrderSide = {
	Buy: "buy",
	Sell: "sell",
} as const;

/** OrderSide type: Buy | Sell */
export type OrderSide = (typeof OrderSide)[keyof typeof OrderSide];

// ── Fill info ───────────────────────────────────────────────────────

/** Details of a partial or full order fill received from the exchange. */
export interface FillInfo {
	readonly filledSize: Decimal;
	readonly fillPrice: Decimal;
	readonly remainingSize: Decimal;
	readonly timestampMs: number;
	readonly tradeId?: string | undefined;
	readonly fee?: Decimal | undefined;
}

// ── Order result ────────────────────────────────────────────────────

/** Final outcome of an order submission -- includes fill data and terminal state. */
export interface OrderResult {
	readonly clientOrderId: ClientOrderId;
	readonly exchangeOrderId: ExchangeOrderId | null;
	readonly finalState: PendingState;
	readonly totalFilled: Decimal;
	readonly avgFillPrice: Decimal | null;
	readonly tradeId?: string | undefined;
	readonly fee?: Decimal | undefined;
}

// ── Pending order ───────────────────────────────────────────────────

/** Snapshot of an in-flight order tracked by the OrderRegistry. */
export interface PendingOrder {
	readonly clientOrderId: ClientOrderId;
	readonly conditionId: ConditionId;
	readonly tokenId: MarketTokenId;
	readonly side: OrderSide;
	readonly originalSize: Decimal;
	readonly price: Decimal;
	readonly submittedAtMs: number;
	readonly state: PendingState;
	readonly exchangeOrderId: ExchangeOrderId | null;
}
