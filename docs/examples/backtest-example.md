# Backtest Example

Running a historical backtest with the built-in backtest engine.

```typescript
import {
  Decimal,
  priceTrend,
  randomWalk,
  runBacktest,
  type BacktestDetector,
  type EntryState,
  type ReplayTick,
} from "@polybot/sdk";

const detector: BacktestDetector = {
  shouldEnter(tick: ReplayTick) {
    // Buy when price drops below 0.45
    if (tick.bid.lt(Decimal.from("0.45"))) {
      return { direction: "buy" as const, size: Decimal.from("10") };
    }
    return null;
  },

  shouldExit(tick: ReplayTick, entry: EntryState) {
    // Take profit at 10% gain
    const pnl = tick.bid.sub(entry.entryPrice).div(entry.entryPrice);
    return pnl.gt(Decimal.from("0.10"));
  },
};

// Generate synthetic price data
const ticks = priceTrend({ start: 0.5, end: 0.6, steps: 200 });

const result = runBacktest(
  { initialBalance: Decimal.from("1000") },
  ticks,
  detector,
);

// Inspect results
result.finalBalance;  // End balance after all trades
result.totalPnl;      // Cumulative P&L
result.tradeCount;    // Number of completed trades
result.equityCurve;   // Balance at each tick
result.trades;        // Detailed trade records
```

## How It Works

1. **BacktestDetector** defines entry and exit logic using `shouldEnter()` and `shouldExit()`
2. **priceTrend** generates synthetic replay ticks with a linear price trend
3. **runBacktest** drives the tick loop, executes paper trades, and tracks the equity curve
4. Results include full trade records, equity curve, and aggregate P&L

## Data Generators

| Generator | Description |
|-----------|-------------|
| `priceTrend({ start, end, steps })` | Linear price movement |
| `randomWalk({ start, volatility, steps })` | Brownian motion with configurable volatility |

## Running

```bash
npx tsx examples/backtest-demo.ts
```
