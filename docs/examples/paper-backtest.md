# Paper Backtest

Advanced backtest example with slippage and commission models.

```typescript
import type { BacktestDetector, EntryState, ReplayTick } from "@polybot/sdk";
import {
  Decimal,
  FixedBpsSlippage,
  CommissionModel,
  MarketSide,
  calcSharpe,
  calcMaxDrawdown,
  calcWinRate,
  calcProfitFactor,
  meanReverting,
  runBacktest,
} from "@polybot/sdk";

const detector: BacktestDetector = {
  shouldEnter(tick: ReplayTick) {
    if (tick.bid.lt(Decimal.from("0.48"))) {
      return { direction: "buy" as const, size: Decimal.from("10") };
    }
    return null;
  },

  shouldExit(_tick: ReplayTick, entry: EntryState) {
    const pnl = _tick.bid.sub(entry.entryPrice).div(entry.entryPrice);
    return pnl.gt(Decimal.from("0.05"));
  },
};

const ticks = meanReverting(
  { startMs: 0, tickIntervalMs: 1000, numTicks: 500, side: MarketSide.Yes },
  0.5, 0.08, 0.03,
);

const result = runBacktest(
  {
    initialBalance: Decimal.from("1000"),
    slippage: FixedBpsSlippage.create(5),
    commission: CommissionModel.percentage(0.1),
  },
  ticks,
  detector,
);

console.log(`Final Balance: ${result.finalBalance.toString()}`);
console.log(`Trade Count: ${result.tradeCount}`);
console.log(`Win Rate: ${calcWinRate(result.trades.map(t => t.pnl)).toString()}`);
console.log(`Profit Factor: ${calcProfitFactor(result.trades.map(t => t.pnl)).toString()}`);
console.log(`Max Drawdown: ${calcMaxDrawdown(result.equityCurve).toString()}`);
```

## What's Different

Compared to the [simple backtest example](/examples/backtest-example), this adds:

- **`FixedBpsSlippage.create(5)`** — simulates 5 basis points of slippage per fill
- **`CommissionModel.percentage(0.1)`** — deducts 0.1% commission on each trade
- **`calcProfitFactor`** — ratio of gross profit to gross loss

## Running

```bash
npx tsx examples/paper-backtest.ts
```
