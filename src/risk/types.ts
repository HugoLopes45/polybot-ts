/**
 * Risk framework type definitions.
 *
 * GuardContext is a slim interface for guards — decoupled from the full
 * DetectorContext to follow ISP and enable testing with stubs.
 */

import type { Decimal } from "../shared/decimal.js";
import type { ConditionId } from "../shared/identifiers.js";
import type { MarketSide } from "../shared/market-side.js";

// ── Guard verdict (discriminated union) ─────────────────────────────

export type GuardVerdict =
	| { readonly type: "allow" }
	| {
			readonly type: "block";
			readonly guard: string;
			readonly reason: string;
			readonly recoverable: boolean;
			readonly currentValue?: number | undefined;
			readonly threshold?: number | undefined;
	  };

export function allow(): GuardVerdict {
	return { type: "allow" };
}

export function block(guard: string, reason: string): GuardVerdict {
	return { type: "block", guard, reason, recoverable: true };
}

export function blockWithValues(
	guard: string,
	reason: string,
	currentValue: number,
	threshold: number,
): GuardVerdict {
	return { type: "block", guard, reason, recoverable: true, currentValue, threshold };
}

export function blockFatal(guard: string, reason: string): GuardVerdict {
	return { type: "block", guard, reason, recoverable: false };
}

export function blockFatalWithValues(
	guard: string,
	reason: string,
	currentValue: number,
	threshold: number,
): GuardVerdict {
	return { type: "block", guard, reason, recoverable: false, currentValue, threshold };
}

export function isAllowed(verdict: GuardVerdict): verdict is { readonly type: "allow" } {
	return verdict.type === "allow";
}

export function isBlocked(
	verdict: GuardVerdict,
): verdict is GuardVerdict & { readonly type: "block" } {
	return verdict.type === "block";
}

// ── Guard context (slim interface for ISP) ──────────────────────────

export interface GuardContext {
	readonly conditionId: ConditionId;
	nowMs(): number;
	spot(): Decimal | null;
	oraclePrice(): Decimal | null;
	bestBid(side: MarketSide): Decimal | null;
	bestAsk(side: MarketSide): Decimal | null;
	spread(side: MarketSide): Decimal | null;
	spreadPct(side: MarketSide): number | null;
	timeRemainingMs(): number;
	openPositionCount(): number;
	totalExposure(): Decimal;
	availableBalance(): Decimal;
	dailyPnl(): Decimal;
	consecutiveLosses(): number;
	hasPendingOrderFor(conditionId: ConditionId, side: MarketSide): boolean;
	lastTradeTimeMs(conditionId: ConditionId): number | null;
	oracleAgeMs(): number | null;
	bookAgeMs(): number | null;
}

// ── Entry guard interface ───────────────────────────────────────────

export interface EntryGuard {
	readonly name: string;
	check(ctx: GuardContext): GuardVerdict;
	readonly isSafetyCritical?: boolean;
}
