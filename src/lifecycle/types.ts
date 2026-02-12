/**
 * Strategy lifecycle types — state machine for strategy execution.
 *
 * 7 states model the full lifecycle from initialization to shutdown.
 * Transitions are explicitly validated — no implicit state changes.
 */

// ── Strategy States ──────────────────────────────────────────────────

export const StrategyState = {
	/** Initial state before any data received */
	Initializing: "initializing",
	/** Receiving data, building confidence (needs N ticks before trading) */
	WarmingUp: "warming_up",
	/** Fully operational — entries and exits allowed */
	Active: "active",
	/** Temporarily paused — exits allowed, no new entries */
	Paused: "paused",
	/** Risk limit hit — only exits and position management allowed */
	ClosingOnly: "closing_only",
	/** Fatal error — only shutdown allowed, no trading whatsoever */
	Halted: "halted",
	/** Terminal state — clean shutdown completed */
	Shutdown: "shutdown",
} as const;

export type StrategyState = (typeof StrategyState)[keyof typeof StrategyState];

// ── Pause/Halt Reasons ───────────────────────────────────────────────

export const PauseReason = {
	UserRequested: "user_requested",
	RiskLimitBreached: "risk_limit_breached",
	ReconciliationDrift: "reconciliation_drift",
	ExternalSignal: "external_signal",
} as const;

export type PauseReason = (typeof PauseReason)[keyof typeof PauseReason];

export const HaltReason = {
	KillSwitchTriggered: "kill_switch_triggered",
	CriticalDrift: "critical_drift",
	MaxDailyLoss: "max_daily_loss",
	UnrecoverableError: "unrecoverable_error",
	ManualHalt: "manual_halt",
	CircuitBreaker: "circuit_breaker",
	JournalFailure: "journal_failure",
} as const;

export type HaltReason = (typeof HaltReason)[keyof typeof HaltReason];

// ── State Transitions ────────────────────────────────────────────────

export type StateTransition =
	| { readonly type: "initialize" }
	| { readonly type: "update_warmup"; readonly progressPct: number }
	| { readonly type: "warmup_complete" }
	| { readonly type: "pause"; readonly reason: PauseReason }
	| { readonly type: "resume" }
	| { readonly type: "enter_closing_only" }
	| { readonly type: "halt"; readonly reason: HaltReason }
	| { readonly type: "shutdown" };

// ── State Metadata ───────────────────────────────────────────────────

export interface StateSnapshot {
	readonly state: StrategyState;
	readonly enteredAt: number;
	readonly metadata: StateMetadata;
}

export type StateMetadata =
	| { readonly type: "none" }
	| { readonly type: "warmup"; readonly progressPct: number }
	| { readonly type: "pause"; readonly reason: PauseReason }
	| { readonly type: "halt"; readonly reason: HaltReason };

// ── State Errors ─────────────────────────────────────────────────────

export const StateErrorKind = {
	InvalidTransition: "invalid_transition",
	CannotResumeFromHalt: "cannot_resume_from_halt",
	AlreadyTerminal: "already_terminal",
} as const;

export type StateErrorKind = (typeof StateErrorKind)[keyof typeof StateErrorKind];

export interface StateError {
	readonly kind: StateErrorKind;
	readonly message: string;
	readonly from: StrategyState;
	readonly transition: StateTransition["type"];
}

// ── Watchdog ─────────────────────────────────────────────────────────

export const WatchdogStatus = {
	Healthy: "healthy",
	Degraded: "degraded",
	Critical: "critical",
} as const;

export type WatchdogStatus = (typeof WatchdogStatus)[keyof typeof WatchdogStatus];
