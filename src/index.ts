// ── Shared Kernel ────────────────────────────────────────────────────
export {
	type ConditionId,
	type MarketTokenId,
	type ClientOrderId,
	type ExchangeOrderId,
	conditionId,
	marketTokenId,
	clientOrderId,
	exchangeOrderId,
	idToString,
	type Result,
	ok,
	err,
	isOk,
	isErr,
	unwrap,
	unwrapOr,
	Decimal,
	MarketSide,
	oppositeSide,
	complementPrice,
	type Clock,
	SystemClock,
	FakeClock,
	Duration,
	type SdkConfig,
	DEFAULT_SDK_CONFIG,
	TradingError,
	ErrorCategory,
	classifyError,
} from "./shared/index.js";

// ── Lifecycle ────────────────────────────────────────────────────────
export {
	StrategyState,
	PauseReason,
	HaltReason,
	WatchdogStatus,
	StateErrorKind,
	type StateTransition,
	type StateSnapshot,
	type StateError,
	StrategyStateMachine,
	ConnectivityWatchdog,
	DEFAULT_WATCHDOG_CONFIG,
	type WatchdogConfig,
} from "./lifecycle/index.js";

// ── Events ───────────────────────────────────────────────────────────
export {
	type SdkEvent,
	type SdkEventType,
	type DomainEvent,
	type DomainEventType,
	EventDispatcher,
} from "./events/index.js";

// ── Signal & Exits ──────────────────────────────────────────────────
export {
	type DetectorContextLike,
	type ExitPolicy,
	type ExitReason,
	type ExitReasonType,
	type ExitUrgency,
	type OrderDirection,
	type PositionLike,
	type SdkOrderIntent,
	type SignalDetector,
	type SignalKind,
	ExitPipeline,
	EdgeReversalExit,
	EmergencyExit,
	NearExpiryExit,
	StopLossExit,
	TakeProfitExit,
	TimeExit,
	TrailingStopExit,
} from "./signal/index.js";

// ── Risk & Guards ───────────────────────────────────────────────────
export {
	type EntryGuard,
	type GuardContext,
	type GuardVerdict,
	allow,
	block,
	blockFatal,
	blockFatalWithValues,
	blockWithValues,
	isAllowed,
	isBlocked,
	GuardPipeline,
	BalanceGuard,
	BookStalenessGuard,
	CircuitBreakerGuard,
	CooldownGuard,
	DuplicateOrderGuard,
	ExposureGuard,
	KillSwitchGuard,
	KillSwitchMode,
	MaxPositionsGuard,
	MaxSpreadGuard,
	MinEdgeGuard,
	PerMarketLimitGuard,
	PortfolioRiskGuard,
	RateLimitGuard,
	ToxicityGuard,
	UsdcRejectionGuard,
} from "./risk/index.js";

// ── Position ────────────────────────────────────────────────────────
export {
	type ClosedPosition,
	type PositionSnapshot,
	type FillRecord,
	CostBasis,
	SdkPosition,
	PositionManager,
} from "./position/index.js";

// ── Accounting ──────────────────────────────────────────────────────
export {
	type FeeModel,
	computeFee,
	fixedNotionalFee,
	noFees,
	profitBasedFee,
} from "./accounting/index.js";

// ── Order ───────────────────────────────────────────────────────────
export {
	type CancelReason,
	type FillInfo,
	type OrderKind,
	type OrderResult,
	type OrderSide,
	type PendingOrder,
	type PendingState,
	type CancelHandler,
	type CompleteHandler,
	type FillHandler,
	type OrderHandle,
	buyNo,
	buyYes,
	sellNo,
	sellYes,
	canTransitionTo,
	isActive,
	isTerminal,
	tryTransition,
	OrderHandleBuilder,
	OrderRegistry,
} from "./order/index.js";

// ── Context ─────────────────────────────────────────────────────────
export {
	type MarketView,
	type OracleView,
	type PositionView,
	type RiskView,
	type StateView,
	DetectorContext,
} from "./context/index.js";

// ── Strategy ────────────────────────────────────────────────────────
export type {
	AccountingAggregate,
	LifecycleAggregate,
	MonitorAggregate,
	PositionAggregate,
	RiskAggregate,
} from "./strategy/index.js";
