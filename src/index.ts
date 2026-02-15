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
	isNetworkError,
	isRateLimitError,
	isAuthError,
	isOrderError,
	isInsufficientBalance,
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
	type ExchangePosition,
	type ReconcileAction,
	type ReconcileResult,
	type ReconcilerConfig,
	CostBasis,
	SdkPosition,
	PositionManager,
	PositionReconciler,
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
	OrderCoordinator,
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

// ── Auth ────────────────────────────────────────────────────────────
export {
	type ApiKeySet,
	type Credentials,
	createCredentials,
	unwrapCredentials,
	buildL2Headers,
	deriveL2ApiKeys,
} from "./auth/index.js";

// ── Execution ───────────────────────────────────────────────────────
export {
	type Executor,
	type RetryConfig,
	DEFAULT_RETRY_CONFIG,
	PaperExecutor,
	type PaperExecutorConfig,
	withRetry,
	ClobExecutor,
} from "./execution/index.js";

// ── Lib: Ethereum ───────────────────────────────────────────────────
export {
	type EthAddress,
	type EthSigner,
	type SignTypedDataParams,
	createSigner,
} from "./lib/ethereum/index.js";

// ── Lib: HTTP ───────────────────────────────────────────────────────
export { TokenBucketRateLimiter, RateLimiterManager, polymarketPresets } from "./lib/http/index.js";
export type { RateLimiterConfig, RateLimiterStats } from "./lib/http/index.js";

// ── Market ──────────────────────────────────────────────────────────
export {
	type ArbitrageLeg,
	type ArbitrageOpportunity,
	type EffectivePrices,
	type MarketInfo,
	type OrderbookDelta,
	type OrderbookLevel,
	type OrderbookSnapshot,
	type ScanResult,
	type MarketProviders,
	type ArbProfitBreakdown,
	checkArbitrage,
	calcArbProfit,
	calcOptimalSize,
	applyDelta,
	bestAsk,
	bestBid,
	effectivePrice,
	getEffectivePrices,
	midPrice,
	spread,
	MarketCatalog,
	scan,
} from "./market/index.js";

// ── WebSocket ───────────────────────────────────────────────────────
export {
	type BookUpdate,
	type Heartbeat,
	type Subscription,
	type UserFill,
	type UserOrderStatus,
	type WsMessage,
	type ReconnectionConfig,
	type WsClientLike,
	type UserFeedConfig,
	ReconnectionPolicy,
	WsManager,
	MarketFeed,
	UserFeed,
} from "./websocket/index.js";

// ── Lib: WebSocket ──────────────────────────────────────────────────
export { WsClient } from "./lib/websocket/index.js";
export type { WsConfig, WsState } from "./lib/websocket/index.js";

// ── Lib: Logger ─────────────────────────────────────────────────────
export { createLogger } from "./lib/logger/index.js";
export type { Logger, LoggerConfig, LogLevel } from "./lib/logger/index.js";

// ── Lib: Validation ─────────────────────────────────────────────────
export { validate, ValidationError, z } from "./lib/validation/index.js";
export type { ValidationIssue } from "./lib/validation/index.js";

// ── Lib: Events ─────────────────────────────────────────────────────
export { TypedEmitter } from "./lib/events/index.js";
export type { EventMap } from "./lib/events/index.js";

// ── Strategy ────────────────────────────────────────────────────────
export type {
	AccountingAggregate,
	LifecycleAggregate,
	MonitorAggregate,
	PositionAggregate,
	RiskAggregate,
} from "./strategy/index.js";
export {
	BuiltStrategy,
	StrategyBuilder,
	conservative,
	aggressive,
	scalper,
	evHunter,
	TestRunner,
	TestContextBuilder,
} from "./strategy/index.js";
export type {
	StrategyAggregates,
	StateView as StrategyStateView,
	TickContext,
	StrategyComponents,
	Journal,
	JournalEntry,
} from "./strategy/index.js";

// ── Persistence ─────────────────────────────────────────────────────
export { MemoryJournal, FileJournal } from "./persistence/index.js";
export type { CorruptLine, FileJournalConfig, RestoreResult } from "./persistence/index.js";

// ── CTF (Conditional Token Framework) ───────────────────────────────
export {
	CachingTokenResolver,
	CtfClient,
} from "./ctf/index.js";
export type {
	CtfConfig,
	CtfOperation,
	TokenInfo,
	TokenResolverConfig,
} from "./ctf/index.js";

// ── Analytics ───────────────────────────────────────────────────────
export {
	KLineAggregator,
	INTERVAL_MS,
	// Price-only indicators
	calcSMA,
	calcEMA,
	calcRSI,
	calcBollingerBands,
	// Volatility indicators
	calcATR,
	calcDonchian,
	calcKeltner,
	calcChandelier,
	// Trend indicators
	calcMACD,
	calcADX,
	calcAroon,
	calcDEMA,
	calcTRIX,
	calcPSAR,
	// Momentum indicators
	calcStochastic,
	calcWilliamsR,
	calcCCI,
	calcROC,
	calcAO,
	calcStochRSI,
	// Volume indicators
	calcOBV,
	calcVWMA,
	calcMFI,
	calcADL,
	calcCMF,
	calcForceIndex,
	calcNVI,
	calcVPT,
	calcPVO,
	// Orderbook analytics
	calcImbalanceRatio,
	calcVWAP,
	calcSpreadBps,
	estimateSlippage,
	calcBookDepth,
	// Price history
	PriceHistoryClient,
	VALID_INTERVALS,
} from "./analytics/index.js";
export type {
	Candle,
	Interval,
	PricePoint,
	PriceInterval,
	PriceHistoryProvider,
} from "./analytics/index.js";
