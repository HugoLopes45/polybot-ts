# Polybot — Polymarket Trading Bot SDK for TypeScript

<p align="center">
  <strong>The open-source TypeScript framework for building automated Polymarket trading bots.<br/>From idea to live prediction market strategy in 100 lines of code.</strong>
</p>

<p align="center">
  <a href="https://github.com/HugoLopes45/polybot-ts/actions/workflows/ci.yml"><img src="https://github.com/HugoLopes45/polybot-ts/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript&logoColor=white" alt="TypeScript 5.7"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License: MIT"></a>
  <a href="#"><img src="https://img.shields.io/badge/ESM%20%2B%20CJS-dual%20output-blueviolet" alt="ESM + CJS dual output"></a>
  <a href="#"><img src="https://img.shields.io/badge/Tests-1237%20passing-brightgreen" alt="1237 tests passing"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> ·
  <a href="#features">Features</a> ·
  <a href="#polymarket-trading-bot-examples">Examples</a> ·
  <a href="#analytics--technical-indicators">Analytics</a> ·
  <a href="#contributing">Contributing</a>
</p>

---

## What is Polybot?

**Polybot** is a production-grade TypeScript SDK for building automated trading bots on [Polymarket](https://polymarket.com), the leading prediction market platform on Polygon. It provides everything you need to go from a trading idea to a live, risk-managed strategy — **without reinventing position tracking, risk management, or order lifecycle handling** every time.

Built for quantitative traders, developers building robust strategies, researchers backtesting signals, and teams that need production-grade risk management. Includes **25+ technical indicators**, real-time WebSocket feeds, arbitrage detection, and a full analytics suite — all with 18-digit fixed-point `Decimal` precision.

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
- **Guard combinators** — `allOf()`, `anyOf()`, `not()` for composing custom guard logic
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
- **Position reconciliation** — drift detection between local and exchange state
- **7-state order FSM** — Created → Submitted → Open → PartiallyFilled → Filled / Cancelled / Expired
- **OrderHandle builder** — fluent `.onFill().onComplete().timeout()` API

</td>
<td>

### Analytics & Technical Indicators
- **25+ indicators** — SMA, EMA, RSI, MACD, Bollinger Bands, ATR, Stochastic, ADX, and many more
- **5 categories** — volatility, trend, momentum, volume, price-only
- **Orderbook analytics** — imbalance ratio, VWAP, spread (bps), slippage estimation, book depth
- **KLine aggregator** — real-time candle building from price ticks
- **Price history client** — historical data with configurable intervals
- **Arbitrage detection** — cross-market arb scanning with profit/optimal size calculation

</td>
</tr>
<tr>
<td>

### Market Discovery & Rate Limiting
- **MarketCatalog** — search, browse, and discover markets with caching and optional providers
- **Market scanner** — multi-market scanning scored by edge/spread ratio
- **RateLimiterManager** — named limiter groups with Polymarket-specific presets
- **TokenBucketRateLimiter** — configurable rate limiting with injectable clock and stats tracking

</td>
<td>

### Developer Experience
- **Branded identifiers** — `ConditionId`, `MarketTokenId`, `ClientOrderId` (zero runtime cost)
- **BigInt Decimal** — 18-digit fixed-point precision, no floating-point money bugs
- **Result\<T, E\>** — no thrown exceptions in domain code, pattern-match with `isOk()`/`isErr()`
- **Library-abstracted** — all external deps wrapped in `lib/`, swap implementations without touching domain code
- **ESM + CJS dual output** — works everywhere via tsup
- **Clock injection** — deterministic tests, no `Date.now()` in domain code
- **1,237 tests** across 75 test files — hardened through multiple adversarial review passes

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

## Analytics & Technical Indicators

The SDK includes a full analytics module with 25+ indicators, all operating on `Decimal` precision:

### Price & Trend Indicators

```typescript
import { calcSMA, calcEMA, calcRSI, calcMACD, calcBollingerBands,
  calcADX, calcAroon, calcDEMA, calcTRIX, calcPSAR } from '@polybot/sdk';

const closes = candles.map(c => c.close);
const sma = calcSMA(closes, 20);         // Simple Moving Average
const ema = calcEMA(closes, 12);         // Exponential Moving Average
const rsi = calcRSI(closes, 14);         // Relative Strength Index
const macd = calcMACD(closes);           // MACD (12, 26, 9)
const bands = calcBollingerBands(closes); // Bollinger Bands (20, 2)
```

### Volatility Indicators

```typescript
import { calcATR, calcDonchian, calcKeltner, calcChandelier } from '@polybot/sdk';

const atr = calcATR(candles, 14);           // Average True Range
const donchian = calcDonchian(candles, 20); // Donchian Channel
const keltner = calcKeltner(candles);       // Keltner Channel
const chandelier = calcChandelier(candles); // Chandelier Exit
```

### Momentum & Volume Indicators

```typescript
import { calcStochastic, calcCCI, calcOBV, calcVWMA,
  calcMFI, calcCMF } from '@polybot/sdk';

const stoch = calcStochastic(candles);     // Stochastic Oscillator
const cci = calcCCI(candles, 20);          // Commodity Channel Index
const obv = calcOBV(candles);              // On-Balance Volume
const mfi = calcMFI(candles, 14);          // Money Flow Index
```

### Orderbook Analytics

```typescript
import { calcImbalanceRatio, calcVWAP, calcSpreadBps,
  estimateSlippage, calcBookDepth } from '@polybot/sdk';

const imbalance = calcImbalanceRatio(bids, asks, 5); // Top-5 level imbalance
const vwap = calcVWAP(bids, asks);                   // Volume-weighted avg price
const spreadBps = calcSpreadBps(bids, asks);          // Spread in basis points
const slippage = estimateSlippage(asks, size);         // Expected slippage for size
```

### Full Indicator List

| Category | Indicators |
|----------|-----------|
| **Price** | SMA, EMA, RSI, Bollinger Bands |
| **Volatility** | ATR, Donchian Channel, Keltner Channel, Chandelier Exit |
| **Trend** | MACD, ADX, Aroon, DEMA, TRIX, Parabolic SAR |
| **Momentum** | Stochastic, Williams %R, CCI, ROC, Awesome Oscillator, StochRSI |
| **Volume** | OBV, VWMA, MFI, ADL, CMF, Force Index, NVI, VPT, PVO |
| **Orderbook** | Imbalance Ratio, VWAP, Spread (bps), Slippage Estimation, Book Depth |

---

## Development

```bash
pnpm install          # Install dependencies
pnpm vitest run       # Run all 1,237 tests
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
- [x] **Phase 2** — Execution layer, Polymarket CLOB integration, authentication
- [x] **Phase 3** — WebSocket real-time market data, orderbook streaming
- [x] **Phase 4** — Strategy runtime, builder pattern, presets
- [x] **Phase 5** — Persistence, CTF operations (split/merge/redeem), journal
- [x] **Phase 6.1** — Library wrappers (validation, typed events, guard combinators)
- [x] **Phase 6.2** — JSDoc completion, documentation polish, CHANGELOG
- [x] **Hardening** — Multiple adversarial review passes, 400+ tests added, bug fixes
- [x] **Analytics** — 25+ technical indicators, orderbook analytics, rate limiting, market discovery
- [ ] **Phase 7** — npm publish, documentation site, CLI tooling

---

## Comparison with Other Polymarket Tools

| Feature | **Polybot SDK** | Raw CLOB Client | Script-based Bots |
|---------|:-:|:-:|:-:|
| Strategy framework | Yes | No | No |
| Risk management (15 guards) | Yes | No | Manual |
| Exit pipeline (7 policies) | Yes | No | Manual |
| Position tracking with P&L | Yes | No | Basic |
| Order state machine (7 states) | Yes | No | No |
| Technical indicators (25+) | Yes | No | No |
| Orderbook analytics | Yes | No | Manual |
| Arbitrage detection | Yes | No | Manual |
| Rate limiting with presets | Yes | Manual | Manual |
| Market discovery & scanning | Yes | Manual | Manual |
| Library abstraction layer | Yes | No | No |
| Test suite | 1,237 tests | N/A | N/A |

---

## Contributing

Contributions are welcome! Please follow these guidelines:

1. **Fork** the repo and create a feature branch from `main`
2. **Write tests first** (TDD) — all PRs must include tests
3. **Follow conventions** — Biome lint, strict TypeScript, immutable patterns
4. **Keep files < 800 LOC** — propose a split plan if needed
5. **Run all checks** before submitting: `pnpm ci`

See [ARCHITECTURE.md](ARCHITECTURE.md) for design decisions and module boundaries.
See [CONTRIBUTING.md](CONTRIBUTING.md) for tutorials on adding guards, exits, and strategies.

---

## License

[MIT](LICENSE) — built by [@HugoLopes45](https://github.com/HugoLopes45)
