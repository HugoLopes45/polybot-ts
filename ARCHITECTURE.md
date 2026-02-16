# Architecture — Polybot TypeScript SDK

## Layer Diagram

```
┌─────────────────────────────────────────────────────┐
│                   Public API (index.ts)              │
├─────────────────────────────────────────────────────┤
│              Strategy Runtime (strategy/)             │
│   ┌─────────────┐  ┌──────────┐  ┌───────────────┐  │
│   │BuiltStrategy│  │  Builder │  │    Presets     │  │
│   └─────────────┘  └──────────┘  └───────────────┘  │
├─────────────────────────────────────────────────────┤
│                 Bounded Contexts                     │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────────┐  │
│  │ risk │ │signal│ │order │ │ pos  │ │ lifecycle│  │
│  ├──────┤ ├──────┤ ├──────┤ ├──────┤ ├──────────┤  │
│  │market│ │ auth │ │ exec │ │ acct │ │  events  │  │
│  ├──────┤ ├──────┤ ├──────┤ ├──────┤ ├──────────┤  │
│  │  ws  │ │ ctf  │ │persist│ │contxt│ │analytics │  │
│  ├──────┤ ├──────┤ ├──────┤ ├──────┤ ├──────────┤  │
│  │price │ │ btest│ │ size │ │observ│ │  micro   │  │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────────┘  │
├─────────────────────────────────────────────────────┤
│                 Shared Kernel (shared/)               │
│  identifiers · decimal · result · errors · time      │
│  market-side · config                                │
├─────────────────────────────────────────────────────┤
│              Library Wrappers (lib/)                  │
│  ethereum · clob · websocket · http · logger ·       │
│  validation · events · cache                         │
├─────────────────────────────────────────────────────┤
│         External Libraries (node_modules)             │
│  viem · @polymarket/clob-client · ws · decimal.js    │
│  zod · pino · eventemitter3                          │
└─────────────────────────────────────────────────────┘
```

## Core Interfaces

### SignalDetector<TConfig, TSignal>
The ONLY interface users implement. Two methods:
- `detectEntry(ctx: DetectorContext): TSignal | null`
- `toOrder(signal: TSignal, ctx: DetectorContext): SdkOrderIntent`

### EntryGuard
Pre-trade safety check. Returns `GuardVerdict` (Allow | Block).
Composed via `GuardPipeline` (AND semantics, short-circuit on Block).
Guard combinators: `allOf()`, `anyOf()`, `not()` for composing custom logic.

### ExitPolicy
Position exit detection. Returns `ExitReason | null`.
Composed via `ExitPipeline` (OR semantics, first exit wins).

### Executor
Order submission abstraction. Two implementations:
- `ClobExecutor` — real Polymarket CLOB
- `PaperExecutor` — simulation for testing

## Data Flow

```
WebSocket Update
  │
  ├─ Watchdog.touch()
  ├─ StateMachine.canOpen()?
  ├─ Build DetectorContext snapshot
  │
  ├─ EXIT: ExitPipeline.evaluate() for each open position
  │    └─ If exit → submit sell → close position → emit events
  │
  ├─ GUARD: GuardPipeline.evaluate()
  │    └─ If block → emit RiskLimitBreached → return
  │
  ├─ DETECT: detector.detectEntry(ctx)
  │    └─ If signal → build order intent
  │
  ├─ EXECUTE: executor.submit() with retry + saga compensation
  │
  └─ BOOKKEEP: positions.open() → journal.append() → events
```

## Error Handling

All domain operations return `Result<T, TradingError>`. Errors are classified:
- **Retryable**: Network, Timeout, RateLimit → exponential backoff
- **NonRetryable**: Auth, OrderRejected, InsufficientBalance → fail immediately
- **Fatal**: Config, System → halt strategy

Error objects include:
- `hint` field for actionable debugging guidance
- `toJSON()` for structured logging
- Immutable `cause` chain for error tracing
- Type guards (`isNetworkError()`, `isRateLimitError()`, etc.) for pattern matching

## Bounded Contexts

### Core Trading
| Context | Responsibility |
|---------|---------------|
| `risk/` | 15 entry guards, GuardPipeline, combinators, 4 presets |
| `signal/` | SignalDetector interface, 7 exit policies, ExitPipeline |
| `order/` | Order FSM (7 states), OrderCoordinator, OrderHandle builder |
| `position/` | PositionManager (immutable), CostBasis (FIFO), reconciliation |
| `execution/` | ClobExecutor, PaperExecutor, retry with backoff |

### Infrastructure
| Context | Responsibility |
|---------|---------------|
| `market/` | MarketCatalog (discovery + caching), orderbook model, arbitrage detection, scanner |
| `websocket/` | WsManager, MarketFeed, UserFeed, reconnection policy |
| `auth/` | L2 key derivation, credential wrapping with auto-redaction |
| `ctf/` | CTF operations (split/merge/redeem), CachingTokenResolver |
| `persistence/` | MemoryJournal, FileJournal (JSONL), corrupt line detection |
| `analytics/` | 25+ technical indicators, KLine aggregator, orderbook analytics, price history |
| `pricing/` | Black-Scholes, Dutch book, WeightedOracle, impact models, spread calculators |
| `backtest/` | Backtest engine, historical data generators, performance metrics, slippage models |
| `sizing/` | KellySizer, FixedSizer, PositionSizer interface, Kelly criterion sizing |

### Cross-Cutting
| Context | Responsibility |
|---------|---------------|
| `events/` | EventDispatcher, SDK + domain event system |
| `lifecycle/` | Strategy state machine (6 states), ConnectivityWatchdog |
| `accounting/` | FeeModel (none, fixed notional, profit-based) |
| `context/` | DetectorContext facade implementing 5 ISP sub-views |
| `strategy/` | BuiltStrategy tick loop, StrategyBuilder, 4 presets, TestRunner |

### Shared & Library
| Layer | Contents |
|-------|----------|
| `shared/` | Branded identifiers, Decimal, Result, TradingError, Clock, Duration, config |
| `lib/ethereum/` | Signer, contract reader/writer interfaces (wraps viem) |
| `lib/clob/` | CLOB client wrapper and order builder (wraps @polymarket/clob-client) |
| `lib/websocket/` | WsClient with ping/pong keepalive (wraps ws) |
| `lib/http/` | TokenBucketRateLimiter, RateLimiterManager with presets |
| `lib/cache/` | LRU cache with TTL and injectable Clock |
| `lib/decimal/` | Decimal wrapper over decimal.js-light |
| `lib/logger/` | Structured logging wrapper (wraps pino) |
| `lib/validation/` | Zod wrapper returning Result<T, ValidationError> |
| `lib/events/` | TypedEmitter<TEvents> wrapping eventemitter3 |

## Analytics Module

The analytics context (`src/analytics/`) provides 25+ technical indicators organized by category:

| Category | Indicators |
|----------|-----------|
| **Price** | SMA, EMA, RSI, Bollinger Bands |
| **Volatility** | ATR, Donchian Channel, Keltner Channel, Chandelier Exit |
| **Trend** | MACD, ADX, Aroon, DEMA, TRIX, Parabolic SAR |
| **Momentum** | Stochastic, Williams %R, CCI, ROC, Awesome Oscillator, StochRSI |
| **Volume** | OBV, VWMA, MFI, ADL, CMF, Force Index, NVI, VPT, PVO |
| **Orderbook** | Imbalance Ratio, VWAP, Spread (bps), Slippage Estimation, Book Depth |

All indicators operate on the SDK's `Decimal` type for precision. Candle data is managed by `KLineAggregator` (real-time) and `PriceHistoryClient` (historical).

## Implementation Phases

- [x] Phase 0: Foundation (shared/, lifecycle/, events/)
- [x] Phase 1: Risk & Signal Framework
- [x] Phase 2: Execution & Auth
- [x] Phase 3: WebSocket & Market Data
- [x] Phase 4: Strategy Runtime
- [x] Phase 5: Persistence & CTF
- [x] Phase 6.1: Library Wrappers (validation, typed events, guard combinators)
- [x] Phase 6.2: Documentation & Polish
- [x] Hardening: Multiple adversarial review passes
- [x] Phase 9: Pricing models, backtesting, position sizing, microstructure, observability
- [ ] Phase 7: npm publish & CLI

2,071 tests across 122 test files.
