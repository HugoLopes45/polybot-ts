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

export const OrderKind = {
	GTC: "gtc",
	IOC: "ioc",
	FOK: "fok",
	GTD: "gtd",
} as const;

export type OrderKind = (typeof OrderKind)[keyof typeof OrderKind];

// ── Pending state (7-state machine) ────────────────────────────────

export const PendingState = {
	Created: "created",
	Submitted: "submitted",
	Open: "open",
	PartiallyFilled: "partially_filled",
	Filled: "filled",
	Cancelled: "cancelled",
	Expired: "expired",
} as const;

export type PendingState = (typeof PendingState)[keyof typeof PendingState];

// ── Cancel reason ───────────────────────────────────────────────────

export const CancelReason = {
	UserRequested: "user_requested",
	Timeout: "timeout",
	InsufficientFunds: "insufficient_funds",
	MarketClosed: "market_closed",
	SubmissionFailed: "submission_failed",
	Exchange: "exchange",
} as const;

export type CancelReason = (typeof CancelReason)[keyof typeof CancelReason];

// ── Order side ──────────────────────────────────────────────────────

export const OrderSide = {
	Buy: "buy",
	Sell: "sell",
} as const;

export type OrderSide = (typeof OrderSide)[keyof typeof OrderSide];

// ── Fill info ───────────────────────────────────────────────────────

export interface FillInfo {
	readonly filledSize: Decimal;
	readonly fillPrice: Decimal;
	readonly remainingSize: Decimal;
	readonly timestampMs: number;
	readonly tradeId?: string | undefined;
	readonly fee?: Decimal | undefined;
}

// ── Order result ────────────────────────────────────────────────────

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
