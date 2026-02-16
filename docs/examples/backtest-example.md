# Backtest Example

Running a historical backtest with the built-in backtest engine.

```typescript
import type { BacktestDetector, EntryState, ReplayTick } from "@polybot/sdk";
import {
  Decimal,
  FixedBpsSlippage,
  MarketSide,
  calcMaxDrawdown,
  calcSharpe,
  calcWinRate,
  meanReverting,
  runBacktest,
} from "@polybot/sdk";

const detector: BacktestDetector = {
  shouldEnter(tick: ReplayTick) {
    if (tick.bid.lt(Decimal.from("0.45"))) {
      return { direction: "buy" as const, size: Decimal.from("10") };
    }
    return null;
  },

  shouldExit(tick: ReplayTick, entry: EntryState) {
    const pnl = tick.bid.sub(entry.entryPrice).div(entry.entryPrice);
    return pnl.gt(Decimal.from("0.10"));
  },
};

const ticks = Array.from(
  meanReverting(
    { startMs: 0, tickIntervalMs: 1000, numTicks: 500, side: MarketSide.Yes },
    0.5, 0.05, 0.02,
  ),
);

const result = runBacktest(
  { initialBalance: Decimal.from("1000"), slippage: FixedBpsSlippage.create(5) },
  ticks,
  detector,
);

console.log(`Final Balance: ${result.finalBalance.toString()}`);
console.log(`Trade Count: ${result.tradeCount}`);
console.log(`Win Rate: ${calcWinRate(result.trades.map(t => t.pnl)).toString()}`);
console.log(`Max Drawdown: ${calcMaxDrawdown(result.equityCurve).toString()}`);
```

## How It Works

1. **BacktestDetector** defines entry and exit logic using `shouldEnter()` and `shouldExit()`
2. **meanReverting** generates synthetic replay ticks with configurable reversion strength
3. **runBacktest** drives the tick loop, executes paper trades, and tracks the equity curve
4. Metrics functions compute Sharpe, win rate, max drawdown from trade results

## Data Generators

| Generator | Description |
|-----------|-------------|
| `priceTrend(config, start, end)` | Linear price movement |
| `randomWalk(config, start, volatility)` | Brownian motion |
| `meanReverting(config, target, reversion, volatility)` | Mean-reverting price series |
| `expiryCountdown(config, finalPrice)` | Expiry convergence simulation |

## Running

```bash
npx tsx examples/backtest-demo.ts
```
