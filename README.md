# Polybot — Polymarket Trading Bot SDK for TypeScript

<p align="center">
  <strong>The open-source TypeScript framework for building automated Polymarket trading bots.<br/>From idea to live prediction market strategy in 100 lines of code.</strong>
</p>

<p align="center">
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript&logoColor=white" alt="TypeScript 5.7"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License: MIT"></a>
  <a href="#"><img src="https://img.shields.io/badge/ESM%20%2B%20CJS-dual%20output-blueviolet" alt="ESM + CJS dual output"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> ·
  <a href="#features">Features</a> ·
  <a href="#polymarket-trading-bot-examples">Examples</a> ·
  <a href="#contributing">Contributing</a>
</p>

---

## What is Polybot?

**Polybot** is a production-grade TypeScript SDK for building automated trading bots on [Polymarket](https://polymarket.com), the leading prediction market platform on Polygon. It provides everything you need to go from a trading idea to a live, risk-managed strategy — **without reinventing position tracking, risk management, or order lifecycle handling** every time. Built for quantitative traders, developers building robust strategies, researchers backtesting signals, and teams that need production-grade risk management.

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

### Position & Order Management
- **Immutable position objects** — all mutations return new instances (functional style)
- **High-water mark tracking** — automatic HWM, drawdown %, and ROI computation
- **FIFO cost basis** — per-fill tracking with weighted average price
- **7-state order FSM** — Created → Submitted → Open → PartiallyFilled → Filled / Cancelled / Expired
- **OrderHandle builder** — fluent `.onFill().onComplete().timeout()` API

</td>
<td>

### Developer Experience
- **Branded identifiers** — `ConditionId`, `MarketTokenId`, `ClientOrderId` (zero runtime cost)
- **BigInt Decimal** — 18-digit fixed-point precision, no floating-point money bugs
- **Result\<T, E\>** — no thrown exceptions in domain code, pattern-match with `isOk()`/`isErr()`
- **Zero runtime dependencies** — pure TypeScript, no `node_modules` bloat
- **ESM + CJS dual output** — works everywhere via tsup
- **Clock injection** — deterministic tests, no `Date.now()` in domain code

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

## Development

```bash
pnpm install          # Install dependencies
pnpm test             # Run tests
pnpm test:watch       # Watch mode for TDD
pnpm typecheck        # TypeScript strict type checking
pnpm lint             # Biome linting
pnpm build            # Build ESM + CJS output
pnpm ci               # Run all CI checks
```

---

## Roadmap

- [x] **Phase 0** — Shared kernel, lifecycle state machine, domain events
- [x] **Phase 1** — Risk guards, exit pipelines, position tracking, order FSM
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
| Zero runtime dependencies | Yes | No | Varies |

---

## Contributing

Contributions are welcome! Please follow these guidelines:

1. **Fork** the repo and create a feature branch from `main`
2. **Write tests first** (TDD) — all PRs must include tests
3. **Follow conventions** — Biome lint, strict TypeScript, immutable patterns
4. **Keep files < 800 LOC** — propose a split plan if needed
5. **Run all checks** before submitting: `pnpm ci`

See [ARCHITECTURE.md](ARCHITECTURE.md) for design decisions and module boundaries.

---

## License

[MIT](LICENSE) — built by [@HugoLopes45](https://github.com/HugoLopes45)
