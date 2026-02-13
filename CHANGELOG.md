# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- JSDoc coverage on all public API exports
- CONTRIBUTING tutorials (guards, exits, strategies)
- CI status badge in README

### Fixed

- README: removed false "zero runtime dependencies" claim
- README/ARCHITECTURE: updated roadmap to reflect completed phases
- SECURITY: switched to GitHub Security Advisories for private reporting

## Phase 6.1 — Library Wrappers

### Added

- `lib/validation/` — Zod wrapper returning `Result<T, ValidationError>`
- `lib/events/` — `TypedEmitter<TEvents>` wrapping eventemitter3
- Guard combinators: `allOf()`, `anyOf()`, `not()` for composing guards
- Position reconciliation for detecting drift between local and exchange state
- Strategy stats tracking (tick count, trade count, win rate)
- Warmup lifecycle phase for strategies
- MarketCatalog enhancements (search cache, rate limiter)

### Changed

- Clock injection into `BuiltStrategy` and `Cache` for deterministic testing
- DDD renames: `OrderService` → `OrderCoordinator`, `MarketService` → `MarketCatalog`
- Dependency interfaces renamed: `*Deps` → `*Providers`/`*Components`/`*Aggregates`

## Phase 5 — Persistence & CTF

### Added

- `MemoryJournal` — in-memory append-only journal for testing and backtesting
- `FileJournal` — JSONL-based persistent journal with corrupt line detection
- `CtfClient` — CTF operations (split, merge, redeem) via ContractWriter
- `CachingTokenResolver` — resolves condition IDs to token pairs with LRU cache
- CTF type definitions (`TokenInfo`, `CtfConfig`)

## Phase 4 — Strategy Runtime

### Added

- `BuiltStrategy` — full tick-loop runtime (exit → guard → detect → execute → bookkeep)
- `StrategyBuilder` — fluent builder for assembling strategies from components
- 4 strategy presets: `standard()`, `conservative()`, `aggressive()`, `evHunter()`
- `TestContextBuilder` and `TestRunner` for strategy testing
- `Journal` interface for recording strategy decisions
- Example strategies: simple-arb, EV hunter, conservative MM, scanner

## Phase 3 — WebSocket & Market Data

### Added

- `WsClient` — WebSocket client wrapper with ping/pong keepalive
- `WsManager` — subscription management, message buffering, generation tracking
- `MarketFeed` — per-condition orderbook snapshot maintenance from BookUpdate messages
- `UserFeed` — routes user-specific WebSocket messages (fills, order status)
- Orderbook model with delta application and snapshot queries
- `MarketCatalog` — market information access with caching
- `scan()` — multi-market scanner scoring by edge/spread ratio

## Phase 2 — Execution & Auth

### Added

- `ClobExecutor` — Executor backed by Polymarket CLOB API with rate limiting
- `PaperExecutor` — simulated execution for backtesting (configurable fill probability, slippage)
- `withRetry()` — exponential backoff with jitter for retryable errors
- `Executor` interface and `RetryConfig`
- L2 authentication module (`createSigner`, `EthSigner`)
- CLOB client wrapper and order builder
- `lib/decimal/` — Decimal wrapper over decimal.js-light
- `lib/http/` — `TokenBucketRateLimiter` with injectable clock
- `lib/ethereum/` — signer, contract reader/writer interfaces

## Phase 1 — Risk & Signal Framework

### Added

- 15 built-in risk guards: MaxSpread, Balance, RateLimit, DuplicateOrder, Cooldown, Exposure, MaxPositions, MinEdge, BookStaleness, KillSwitch, CircuitBreaker, PerMarketLimit, PortfolioRisk, Toxicity, UsdcRejection
- `GuardPipeline` — AND semantics, short-circuit on first block, diagnostic values
- 4 guard presets: standard, conservative, aggressive, minimal
- 7 exit policies: TakeProfit, StopLoss, TrailingStop, TimeExit, EdgeReversal, NearExpiry, Emergency
- `ExitPipeline` — OR semantics, first exit wins, composable with `.with()`
- `PositionManager` — immutable position tracking with high-water mark and drawdown
- Order FSM (7 states: Created → Submitted → Open → PartiallyFilled → Filled / Cancelled / Expired)
- `OrderHandle` builder with fluent `.onFill().onComplete().timeout()` API
- `DetectorContext` — facade implementing 5 ISP sub-views
- `FeeModel` — discriminated union (None, FixedNotional, ProfitBased)

## Phase 0 — Foundation

### Added

- Shared kernel: branded identifiers (`ConditionId`, `MarketTokenId`, `ClientOrderId`, `ExchangeOrderId`, `EthAddress`)
- `Decimal` — 18-digit fixed-point wrapper over decimal.js-light
- `Result<T, E>` — discriminated union for error handling without exceptions
- `TradingError` hierarchy with error categories (Retryable, NonRetryable, Fatal)
- `Clock` interface with `SystemClock` and `FakeClock` for deterministic testing
- Lifecycle state machine with 6 states
- `ConnectivityWatchdog` for feed liveness detection
- `EventDispatcher` with SDK event system
- Project scaffolding: TypeScript 5.7, Biome, Vitest, tsup (ESM + CJS)
