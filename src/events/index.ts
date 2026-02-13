export type {
	SdkEvent,
	SdkEventType,
	OrderPlaced,
	OrderCancelled,
	FillReceived,
	PositionOpened,
	PositionClosed,
	PositionReduced,
	GuardBlocked,
	StateChanged,
	WatchdogAlert,
	ErrorOccurred,
} from "./sdk-events.js";

export type {
	DomainEvent,
	DomainEventType,
	OpportunityDetected,
	RiskLimitBreached,
	PositionBecameOrphaned,
	FeedDegraded,
	MarketResolved,
	DailyLossExceeded,
	CircuitBreakerTripped,
	ReconciliationDrift,
} from "./domain-events.js";

export { EventDispatcher } from "./event-dispatcher.js";
export type { HandlerErrorCallback } from "./event-dispatcher.js";
