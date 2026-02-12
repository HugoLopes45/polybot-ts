/**
 * Signal & Exit type definitions.
 *
 * Slim interfaces (PositionLike, DetectorContextLike) decouple signal/
 * from position/ and context/ — enabling TDD with stubs and breaking
 * circular dependencies between bounded contexts.
 */

import type { Decimal } from "../shared/decimal.js";
import type { ConditionId, MarketTokenId } from "../shared/identifiers.js";
import type { MarketSide } from "../shared/market-side.js";

// ── Slim interfaces (satisfied by real types later) ─────────────────

export interface PositionLike {
	readonly conditionId: ConditionId;
	readonly tokenId: MarketTokenId;
	readonly side: MarketSide;
	readonly entryPrice: Decimal;
	readonly size: Decimal;
	readonly highWaterMark: Decimal;
	readonly entryTimeMs: number;
	pnlTotal(exitPrice: Decimal): Decimal;
	drawdown(currentPrice: Decimal): Decimal;
}

export interface DetectorContextLike {
	readonly conditionId: ConditionId;
	nowMs(): number;
	spot(): Decimal | null;
	oraclePrice(): Decimal | null;
	timeRemainingMs(): number;
	bestBid(side: MarketSide): Decimal | null;
	bestAsk(side: MarketSide): Decimal | null;
	spread(side: MarketSide): Decimal | null;
}

// ── Exit urgency ────────────────────────────────────────────────────

export const ExitUrgency = {
	Low: "low",
	Medium: "medium",
	High: "high",
	Emergency: "emergency",
} as const;

export type ExitUrgency = (typeof ExitUrgency)[keyof typeof ExitUrgency];

// ── Exit reason (discriminated union, 7 variants) ───────────────────

export type ExitReason =
	| { readonly type: "take_profit"; readonly roi: Decimal }
	| { readonly type: "stop_loss"; readonly loss: Decimal }
	| { readonly type: "trailing_stop"; readonly drawdownPct: Decimal }
	| { readonly type: "time_exit"; readonly remainingSecs: number }
	| { readonly type: "edge_reversal"; readonly newEdge: number }
	| { readonly type: "near_expiry"; readonly remainingSecs: number }
	| { readonly type: "emergency"; readonly reason: string };

export type ExitReasonType = ExitReason["type"];

// ── Exit policy interface ───────────────────────────────────────────

export interface ExitPolicy {
	readonly name: string;
	shouldExit(position: PositionLike, ctx: DetectorContextLike): ExitReason | null;
}

// ── Signal kind ─────────────────────────────────────────────────────

export const SignalKind = {
	Entry: "entry",
	Exit: "exit",
	Hedge: "hedge",
	Rebalance: "rebalance",
} as const;

export type SignalKind = (typeof SignalKind)[keyof typeof SignalKind];

// ── Order direction ─────────────────────────────────────────────────

export const OrderDirection = {
	Buy: "buy",
	Sell: "sell",
} as const;

export type OrderDirection = (typeof OrderDirection)[keyof typeof OrderDirection];

// ── Order intent (what a detector wants to execute) ─────────────────

export interface SdkOrderIntent {
	readonly conditionId: ConditionId;
	readonly tokenId: MarketTokenId;
	readonly side: MarketSide;
	readonly direction: OrderDirection;
	readonly price: Decimal;
	readonly size: Decimal;
}

// ── Signal detector interface (THE interface users implement) ───────

export interface SignalDetector<_TConfig = unknown, TSignal = unknown> {
	readonly name: string;
	detectEntry(ctx: DetectorContextLike): TSignal | null;
	toOrder(signal: TSignal, ctx: DetectorContextLike): SdkOrderIntent;
}
