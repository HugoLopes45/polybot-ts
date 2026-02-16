# Backtesting

Run historical backtests with configurable slippage models.

## Basic Usage

```typescript
import { runBacktest, Decimal } from "@polybot/sdk";

const detector = {
  shouldEnter(tick) {
    // Return { direction, size } or null
  },
  shouldExit(tick, entry) {
    // Return true to exit, false to hold
  }
};

const result = runBacktest(
  {
    initialBalance: Decimal.from("1000"),
    slippage: undefined, // optional SlippageModel
    commission: undefined, // optional CommissionModel
  },
  ticks, // Iterable<ReplayTick> - array or generator
  detector
);
```

## Result Structure

```typescript
interface BacktestResult {
  trades: readonly TradeRecord[];
  equityCurve: readonly Decimal[];
  finalBalance: Decimal;
  totalPnl: Decimal;
  tradeCount: number;
}
```

## Trade Record

```typescript
interface TradeRecord {
  entryTick: ReplayTick;
  exitTick: ReplayTick;
  direction: OrderDirection;
  size: Decimal;
  entryPrice: Decimal;
  exitPrice: Decimal;
  pnl: Decimal;
  commission: Decimal;
}
```

## Slippage Models

```typescript
import { fixedSlippage, percentSlippage } from "@polybot/sdk";

const result = runBacktest(
  {
    initialBalance: Decimal.from("1000"),
    slippage: fixedSlippage(Decimal.from("0.001")),
  },
  ticks,
  detector
);
```
