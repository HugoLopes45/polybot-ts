# Polybot — Polymarket Trading Bot SDK for TypeScript

<p align="center">
  <strong>The open-source TypeScript framework for building automated Polymarket trading bots.<br/>From idea to live prediction market strategy in 100 lines of code.</strong>
</p>

<p align="center">
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript&logoColor=white" alt="TypeScript 5.7"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License: MIT"></a>
  <a href="#testing"><img src="https://img.shields.io/badge/tests-352%20passing-brightgreen" alt="352 tests passing"></a>
  <a href="#"><img src="https://img.shields.io/badge/zero-runtime%20deps-orange" alt="Zero runtime dependencies"></a>
  <a href="#"><img src="https://img.shields.io/badge/ESM%20%2B%20CJS-dual%20output-blueviolet" alt="ESM + CJS dual output"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> ·
  <a href="#features">Features</a> ·
  <a href="#polymarket-trading-bot-architecture">Architecture</a> ·
  <a href="#api-reference">API</a> ·
  <a href="#contributing">Contributing</a>
</p>

---

## What is Polybot?

**Polybot** is a production-grade TypeScript SDK for building automated trading bots on [Polymarket](https://polymarket.com), the leading prediction market platform on Polygon. It provides everything you need to go from a trading idea to a live, risk-managed strategy — **without reinventing position tracking, risk management, or order lifecycle handling** every time.

Unlike raw API wrappers, Polybot gives you a **complete strategy framework**: signal detection, composable risk guards, exit pipelines, position management, and order state machines — all type-safe, immutable, and tested with 352 unit tests.

### Who is this for?

- **Quantitative traders** building prediction market strategies on Polymarket
- **Developers** who want a robust TypeScript SDK instead of hacking scripts
- **Researchers** backtesting prediction market signals and risk models
- **Teams** that need production-grade risk management (kill switches, circuit breakers, exposure limits)

---

## Quick Start

### Install the Polymarket Trading SDK

```bash
pnpm add @polybot/sdk
# or: npm install @polybot/sdk
# or: yarn add @polybot/sdk
```

### Build Your First Polymarket Trading Bot

Implement the `SignalDetector` interface — the **only** interface you need:

```typescript
import type { SignalDetector, DetectorContextLike, SdkOrderIntent } from '@polybot/sdk';
import { buyYes, Decimal, MarketSide, marketTokenId } from '@polybot/sdk';

// Your entire strategy is this one interface
const oracleArb: SignalDetector<unknown, { price: Decimal; edge: number }> = {
  name: 'OracleArbitrage',

  detectEntry(ctx) {
    const oracle = ctx.oraclePrice();
    const ask = ctx.bestAsk(MarketSide.Yes);
    if (!oracle || !ask) return null;

    const edge = oracle.sub(ask).div(ask).toNumber();
    return edge > 0.02 ? { price: ask, edge } : null; // 2% edge threshold
  },

  toOrder(signal, ctx) {
    const size = Decimal.from(String(Math.floor(signal.edge * 1000)));
    return buyYes(ctx.conditionId, marketTokenId('yes-token'), signal.price, size);
  },
};

// The SDK handles everything else:
// Risk guards → Exit policies → Position tracking → Order lifecycle → P&L
```

**You write the signal. Polybot handles the rest.**

---

## Features

<table>
<tr>
<td width="50%">

### Risk Management for Prediction Markets
- **15 built-in risk guards** — spread limits, exposure caps, balance checks, kill switch, circuit breaker, rate limiting, cooldown, and more
- **GuardPipeline** — AND semantics, short-circuits on first block, diagnostic values on every rejection
- **4 presets** — standard, conservative, aggressive, minimal
- **Safety-critical guards** — KillSwitch (soft 3% / hard 5% daily loss) and CircuitBreaker auto-halt trading

</td>
<td width="50%">

### Automated Exit Strategies
- **7 built-in exit policies** — take-profit, stop-loss, trailing stop, time exit, edge reversal, near-expiry, emergency
- **ExitPipeline** — OR semantics, first exit wins, composable with immutable `.with()`
- **4 urgency levels** — Low, Medium, High, Emergency
- **Prediction-market-aware** — handles YES/NO token pairs, expiry windows, oracle price feeds

</td>
</tr>
<tr>
<td>

### Position Tracking & P&L
- **Immutable position objects** — all mutations return new instances (functional style)
- **High-water mark tracking** — automatic HWM, drawdown %, and ROI computation
- **FIFO cost basis** — per-fill tracking with weighted average price
- **Bounded closed history** — configurable cap on closed position records
- **Per-side book data** — separate YES/NO order books for prediction markets

</td>
<td>

### Order Lifecycle Management
- **7-state order FSM** — Created → Submitted → Open → PartiallyFilled → Filled / Cancelled / Expired
- **Validated transitions** — `tryTransition()` returns `Result<T,E>`, never throws
- **OrderHandle builder** — fluent `.onFill().onComplete().timeout()` API
- **OrderRegistry** — dedup, per-market index, TTL-based cleanup with Clock injection

</td>
</tr>
<tr>
<td>

### TypeScript Type Safety
- **Branded identifiers** — `ConditionId`, `MarketTokenId`, `ClientOrderId` (zero runtime cost)
- **BigInt Decimal** — 18-digit fixed-point precision, no floating-point money bugs
- **Result\<T, E\>** — no thrown exceptions in domain code, pattern-match with `isOk()`/`isErr()`
- **Discriminated unions** — `GuardVerdict`, `ExitReason`, `FeeModel`, `PendingState`

</td>
<td>

### Developer Experience
- **352 tests** in < 1 second — 100% guard and exit coverage
- **Zero runtime dependencies** — pure TypeScript, no `node_modules` bloat
- **ESM + CJS dual output** — works everywhere via tsup
- **Clock injection** — deterministic tests, no `Date.now()` in domain code
- **Biome linter** — zero warnings, strict formatting

</td>
</tr>
</table>

---

## Polymarket Trading Bot Examples

### Configure Risk Guards for Your Bot

```typescript
import { GuardPipeline, MaxSpreadGuard, MaxPositionsGuard,
  CooldownGuard, KillSwitchGuard, CircuitBreakerGuard, Decimal } from '@polybot/sdk';

// Compose risk guards — AND semantics, short-circuits on first block
const guards = GuardPipeline.create()
  .with(MaxSpreadGuard.normal())           // Block if bid-ask spread > 5%
  .with(MaxPositionsGuard.create(5))       // Max 5 concurrent positions
  .with(CooldownGuard.fromSecs(30))        // 30s cooldown between trades
  .with(KillSwitchGuard.create(3, 5))      // Soft 3%, hard 5% daily loss
  .with(CircuitBreakerGuard.create(
    Decimal.from('500'), 0.2               // $500 daily limit, 20% consecutive loss
  ));

// Or use a built-in preset
const conservative = GuardPipeline.conservative();
```

### Configure Automated Exit Strategies

```typescript
import { ExitPipeline, TakeProfitExit, StopLossExit,
  TrailingStopExit, NearExpiryExit, EmergencyExit, Decimal } from '@polybot/sdk';

// Compose exit policies — OR semantics, first exit wins
const exits = ExitPipeline.create()
  .with(new TakeProfitExit(Decimal.from('0.15')))   // Take profit at 15% ROI
  .with(new StopLossExit(Decimal.from('-0.08')))     // Stop loss at -8%
  .with(new TrailingStopExit(Decimal.from('0.05')))  // 5% trailing stop from HWM
  .with(new NearExpiryExit(60_000))                  // Exit 60s before market expiry
  .with(new EmergencyExit({ maxHoldTimeMs: 3_600_000 })); // 1h max hold time
```

### Track Positions with Immutable P&L

```typescript
import { PositionManager, Decimal,
  conditionId, marketTokenId, MarketSide, unwrap } from '@polybot/sdk';

let manager = PositionManager.create();

// Open a position (returns Result, never throws)
const result = manager.open(
  conditionId('0x123...'), marketTokenId('tok-yes'),
  MarketSide.Yes, Decimal.from('0.45'), Decimal.from('100'), Date.now(),
);
manager = unwrap(result);

console.log(manager.openCount());       // 1
console.log(manager.totalNotional());   // 45.00

// Close with automatic P&L tracking
const closed = manager.close(conditionId('0x123...'), Decimal.from('0.55'), Date.now());
if (closed) {
  console.log(closed.pnl.toString());   // "10" (profit)
}
```

---

## Polymarket Trading Bot Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Public API (index.ts)                   │
├──────────────────────────────────────────────────────────┤
│                  Strategy Runtime (strategy/)              │
│  PositionAggregate · RiskAggregate · LifecycleAggregate   │
│  MonitorAggregate  · AccountingAggregate                  │
├──────────────────────────────────────────────────────────┤
│                   Bounded Contexts                        │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────────────┐  │
│  │ signal │ │  risk  │ │ order  │ │    position      │  │
│  │ 7 exits│ │15 guard│ │  FSM   │ │  SdkPosition     │  │
│  │pipeline│ │pipeline│ │registry│ │  PositionManager  │  │
│  └────────┘ └────────┘ └────────┘ └──────────────────┘  │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────────────┐  │
│  │context │ │lifecycl│ │ events │ │   accounting     │  │
│  │ 5 views│ │  FSM   │ │dispatch│ │   fee models     │  │
│  └────────┘ └────────┘ └────────┘ └──────────────────┘  │
├──────────────────────────────────────────────────────────┤
│               Shared Kernel (shared/)                     │
│  Decimal · Result · Identifiers · Errors · Clock · Time  │
│  MarketSide · Config                                     │
└──────────────────────────────────────────────────────────┘
```

### Design Principles

| Principle | Implementation |
|-----------|---------------|
| **Domain-Driven Design** | Bounded contexts (`signal/`, `risk/`, `order/`, `position/`), domain primitives, ubiquitous language |
| **Immutability** | All aggregates return new instances — `SdkPosition`, `PositionManager`, `ExitPipeline`, `GuardPipeline` |
| **Interface Segregation** | `DetectorContext` implements 5 focused sub-views: `MarketView`, `PositionView`, `OracleView`, `StateView`, `RiskView` |
| **Result\<T,E\>** | Domain operations return `Result` — no thrown exceptions, explicit error handling |
| **Dependency Injection** | All time-dependent code accepts a `Clock` interface — deterministic testing |
| **Zero Dependencies** | Core SDK has no runtime dependencies — pure TypeScript |

### How a Polymarket Trading Bot Processes Market Data

```
Market Update (WebSocket / Polling)
  │
  ├─ Watchdog.touch()               — connectivity monitoring
  ├─ StateMachine.canOpen()?        — lifecycle gate (7 states)
  ├─ Build DetectorContext           — immutable snapshot of market state
  │
  ├─ EXIT: ExitPipeline.evaluate()  — check each open position
  │    └─ If exit triggered → submit sell → close position → emit events
  │
  ├─ GUARD: GuardPipeline.evaluate()— 15 pre-trade safety checks
  │    └─ If any guard blocks → emit RiskLimitBreached → skip entry
  │
  ├─ DETECT: detector.detectEntry() — YOUR strategy logic runs here
  │    └─ If signal found → toOrder() → submit to exchange
  │
  └─ BOOKKEEP: position.open() → journal → domain events
```

---

## API Reference

### Core Interfaces for Polymarket Bots

#### `SignalDetector<TConfig, TSignal>` — The Strategy Interface

The **only interface you implement** to create a Polymarket trading bot:

```typescript
interface SignalDetector<TConfig = unknown, TSignal = unknown> {
  readonly name: string;
  detectEntry(ctx: DetectorContextLike): TSignal | null;
  toOrder(signal: TSignal, ctx: DetectorContextLike): SdkOrderIntent;
}
```

#### `EntryGuard` — Pre-Trade Risk Check

```typescript
interface EntryGuard {
  readonly name: string;
  check(ctx: GuardContext): GuardVerdict; // Allow or Block with diagnostics
  readonly isSafetyCritical?: boolean;
}
```

#### `ExitPolicy` — Position Exit Detection

```typescript
interface ExitPolicy {
  readonly name: string;
  shouldExit(position: PositionLike, ctx: DetectorContextLike): ExitReason | null;
}
```

### Built-in Risk Guards for Prediction Market Trading

| Guard | What It Does | Safety Critical |
|-------|-------------|:-:|
| `CooldownGuard` | Enforces minimum time between trades | |
| `MaxSpreadGuard` | Blocks when bid-ask spread is too wide | |
| `MaxPositionsGuard` | Limits concurrent open positions | |
| `ExposureGuard` | Caps total exposure as % of balance | |
| `BalanceGuard` | Requires minimum account balance | |
| `DuplicateOrderGuard` | Prevents duplicate pending orders per market | |
| `RateLimitGuard` | Limits orders per time window | |
| `KillSwitchGuard` | Auto-halts on soft (3%) and hard (5%) daily loss | **Yes** |
| `CircuitBreakerGuard` | Trips on daily loss limit or consecutive losses | **Yes** |
| `BookStalenessGuard` | Rejects trades when orderbook data is stale | |
| `MinEdgeGuard` | Requires minimum oracle-vs-market edge | |
| `PortfolioRiskGuard` | Limits portfolio-level drawdown | |
| `PerMarketLimitGuard` | Caps order count per individual market | |
| `ToxicityGuard` | Blocks trading in known toxic markets | |
| `UsdcRejectionGuard` | Rejects USDC.e bridged token markets | |

### Built-in Exit Policies for Automated Trading

| Exit Policy | When It Triggers | Urgency |
|-------------|-----------------|---------|
| `TakeProfitExit` | ROI exceeds target threshold | Low |
| `StopLossExit` | Loss exceeds maximum allowed | High |
| `TrailingStopExit` | Drawdown from high-water mark exceeds % | Medium |
| `TimeExit` | Position held longer than max duration | Medium |
| `EdgeReversalExit` | Trading edge drops below minimum | Medium |
| `NearExpiryExit` | Prediction market approaching expiration | High |
| `EmergencyExit` | Max hold time exceeded or manual trigger | Emergency |

---

## Project Structure

```
src/
├── shared/           # Decimal, Result, branded identifiers, errors, Clock, config
├── lifecycle/        # Strategy state machine (7 states), connectivity watchdog
├── events/           # Domain events, SDK events, typed event dispatcher
├── signal/           # SignalDetector interface, ExitPipeline, 7 exit policies
├── risk/             # EntryGuard interface, GuardPipeline, 15 risk guards
├── position/         # SdkPosition, PositionManager, FIFO CostBasis
├── accounting/       # Fee models (none, fixed notional bps, profit-based)
├── order/            # PendingState FSM, OrderIntent, OrderHandle, OrderRegistry
├── context/          # DetectorContext facade + 5 ISP sub-views
├── strategy/         # Aggregate types (position, risk, lifecycle, monitor, accounting)
└── index.ts          # Public API — single barrel export
```

---

## Development

```bash
# Install dependencies
pnpm install

# Run all 352 tests (< 1 second)
pnpm test

# Watch mode for TDD
pnpm test:watch

# TypeScript strict type checking
pnpm typecheck

# Biome linting (zero warnings)
pnpm lint

# Build ESM + CJS output
pnpm build

# Run all CI checks
pnpm ci
```

### Testing

- **Test-Driven Development** — every feature written test-first (Red → Green → Refactor)
- **352 tests** across 24 test files, total runtime < 1 second
- **Table-driven tests** — guards and exits tested via parameterized inputs
- **Clock injection** — deterministic time in all tests via `FakeClock`
- **Zero mocks** — pure functions + dependency injection, no mocking libraries needed
- **Arrange-Act-Assert** — consistent test structure throughout

---

## Roadmap

- [x] **Phase 0** — Shared kernel, lifecycle state machine, domain events (118 tests)
- [x] **Phase 1** — Risk guards, exit pipelines, position tracking, order FSM (352 tests)
- [ ] **Phase 2** — Execution layer, Polymarket CLOB integration, authentication
- [ ] **Phase 3** — WebSocket real-time market data, orderbook streaming
- [ ] **Phase 4** — Strategy runtime, builder pattern, presets
- [ ] **Phase 5** — Persistence, CTF operations (split/merge/redeem), journal
- [ ] **Phase 6** — npm publish, documentation site, example strategies

---

## Comparison with Other Polymarket Tools

| Feature | **Polybot SDK** | Raw CLOB Client | Script-based Bots |
|---------|:-:|:-:|:-:|
| Strategy framework | Yes | No | No |
| Risk management (15 guards) | Yes | No | Manual |
| Exit pipeline (7 policies) | Yes | No | Manual |
| Position tracking with P&L | Yes | No | Basic |
| Order state machine (7 states) | Yes | No | No |
| Type-safe branded identifiers | Yes | No | No |
| Immutable domain objects | Yes | N/A | No |
| 352+ unit tests | Yes | Varies | Rarely |
| Zero runtime dependencies | Yes | No | Varies |

---

## Contributing

Contributions are welcome! Please follow these guidelines:

1. **Fork** the repo and create a feature branch from `main`
2. **Write tests first** (TDD) — all PRs must include tests
3. **Follow conventions** — Biome lint, strict TypeScript, immutable patterns
4. **Keep files < 800 LOC** — propose a split plan if needed
5. **Run all checks** before submitting: `pnpm ci`

See the [ARCHITECTURE.md](ARCHITECTURE.md) for design decisions and module boundaries.

---

## License

[MIT](LICENSE) — built by [@HugoLopes45](https://github.com/HugoLopes45)
