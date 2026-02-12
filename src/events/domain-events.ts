/**
 * Domain Events — business-level events with semantic meaning.
 *
 * These capture "what it means" rather than "what happened":
 * an opportunity was detected, a risk limit was breached, a feed degraded.
 * Used for alerting, external integrations, and strategy coordination.
 */

import type { HaltReason, WatchdogStatus } from "../lifecycle/types.js";
import type { ClientOrderId, ConditionId, MarketTokenId } from "../shared/identifiers.js";

export type DomainEvent =
	| OpportunityDetected
	| RiskLimitBreached
	| PositionBecameOrphaned
	| FeedDegraded
	| MarketResolved
	| DailyLossExceeded
	| CircuitBreakerTripped
	| ReconciliationDrift;

// ── Event types ──────────────────────────────────────────────────────

export interface OpportunityDetected {
	readonly type: "opportunity_detected";
	readonly timestamp: number;
	readonly conditionId: ConditionId;
	readonly edge: number;
	readonly confidence: number;
}

export interface RiskLimitBreached {
	readonly type: "risk_limit_breached";
	readonly timestamp: number;
	readonly guardName: string;
	readonly reason: string;
	readonly currentValue: number;
	readonly threshold: number;
}

export interface PositionBecameOrphaned {
	readonly type: "position_became_orphaned";
	readonly timestamp: number;
	readonly conditionId: ConditionId;
	readonly tokenId: MarketTokenId;
	readonly clientOrderId: ClientOrderId;
	readonly reason: string;
}

export interface FeedDegraded {
	readonly type: "feed_degraded";
	readonly timestamp: number;
	readonly status: WatchdogStatus;
	readonly silenceMs: number;
}

export interface MarketResolved {
	readonly type: "market_resolved";
	readonly timestamp: number;
	readonly conditionId: ConditionId;
	readonly outcome: string;
}

export interface DailyLossExceeded {
	readonly type: "daily_loss_exceeded";
	readonly timestamp: number;
	readonly totalLoss: number;
	readonly limit: number;
	readonly action: HaltReason;
}

export interface CircuitBreakerTripped {
	readonly type: "circuit_breaker_tripped";
	readonly timestamp: number;
	readonly consecutiveLosses: number;
	readonly drawdownPct: number;
}

export interface ReconciliationDrift {
	readonly type: "reconciliation_drift";
	readonly timestamp: number;
	readonly conditionId: ConditionId;
	readonly sdkSize: number;
	readonly exchangeSize: number;
	readonly driftPct: number;
}

// ── Type guard ───────────────────────────────────────────────────────

export type DomainEventType = DomainEvent["type"];
