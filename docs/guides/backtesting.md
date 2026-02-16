# Backtesting

Run historical backtests with configurable slippage and commission models.

## Basic Usage

```typescript
import type { BacktestDetector, ReplayTick, EntryState } from "@polybot/sdk";
import { runBacktest, Decimal } from "@polybot/sdk";

const detector: BacktestDetector = {
	shouldEnter(tick: ReplayTick) {
		if (tick.bid.lt(Decimal.from("0.45"))) {
			return { direction: "buy" as const, size: Decimal.from("10") };
		}
		return null;
	},
	shouldExit(tick: ReplayTick, entry: EntryState) {
		const roi = tick.bid.sub(entry.entryPrice).div(entry.entryPrice);
		return roi.gt(Decimal.from("0.10")); // exit at 10% profit
	},
};

const result = runBacktest(
	{
		initialBalance: Decimal.from("1000"),
		slippage: undefined,   // optional SlippageModel
		commission: undefined,  // optional CommissionModel
	},
	ticks, // Iterable<ReplayTick> — array or generator
	detector,
);
```

## Result Structure

```typescript
interface BacktestResult {
	readonly trades: readonly TradeRecord[];
	readonly equityCurve: readonly Decimal[];
	readonly finalBalance: Decimal;
	readonly totalPnl: Decimal;
	readonly tradeCount: number;
}
```

## Trade Record

```typescript
interface TradeRecord {
	readonly entryTick: ReplayTick;
	readonly exitTick: ReplayTick;
	readonly direction: OrderDirection;
	readonly size: Decimal;
	readonly entryPrice: Decimal;
	readonly exitPrice: Decimal;
	readonly pnl: Decimal;
	readonly commission: Decimal;
}
```

## Slippage Models

Two built-in models are available:

```typescript
import { FixedBpsSlippage, SizeProportionalSlippage } from "@polybot/sdk";

// Fixed basis-point slippage (e.g., 5 bps = 0.05%)
const fixed = FixedBpsSlippage.create(5);

// Size-proportional: larger orders get worse fills
// coeffBps per unit of size/ADV ratio, ADV = average daily volume
const proportional = SizeProportionalSlippage.create(10, 50_000);
```

Usage with backtest:

```typescript
const result = runBacktest(
	{
		initialBalance: Decimal.from("1000"),
		slippage: FixedBpsSlippage.create(5),
		commission: CommissionModel.percentage(0.1), // 0.1% per trade
	},
	ticks,
	detector,
);
```

## Commission Models

```typescript
import { CommissionModel } from "@polybot/sdk";

CommissionModel.flat(0.50);            // $0.50 per trade
CommissionModel.percentage(0.1);       // 0.1% of notional
CommissionModel.combined(0.25, 0.05);  // $0.25 + 0.05% of notional
```

## Synthetic Data Generators

Generate realistic tick data for backtesting without historical feeds:

```typescript
import { priceTrend, randomWalk, meanReverting, expiryCountdown } from "@polybot/sdk";
import type { GeneratorConfig } from "@polybot/sdk";

const config: GeneratorConfig = {
	startMs: 0,
	tickIntervalMs: 1000,
	numTicks: 500,
	side: "yes",
};

// Linear trend from 0.40 to 0.60
const trending = priceTrend(config, 0.40, 0.60);

// Random walk with 2% volatility
const random = randomWalk(config, 0.50, 0.02);

// Mean-reverting around 0.50 (reversion=0.05, vol=0.02)
const reverting = meanReverting(config, 0.50, 0.05, 0.02);

// Countdown to expiry (settles at 1.0, starts at 0.60, vol=0.03)
const expiry = expiryCountdown(config, 1.0, 0.60, 0.03);
```

All generators return `Iterable<ReplayTick>` — use `Array.from()` to materialize or pass directly to `runBacktest()`.

## Performance Metrics

Compute standard quant metrics from backtest results:

```typescript
import {
	calcSharpe, calcMaxDrawdown, calcWinRate,
	calcProfitFactor, calcCalmarRatio,
} from "@polybot/sdk";

const pnls = result.trades.map(t => t.pnl);

const winRate = calcWinRate(pnls);             // wins / total
const profitFactor = calcProfitFactor(pnls);   // gross profit / gross loss
const maxDrawdown = calcMaxDrawdown(result.equityCurve);

// Sharpe ratio from periodic returns
const returns: Decimal[] = [];
for (let i = 1; i < result.equityCurve.length; i++) {
	const prev = result.equityCurve[i - 1]!;
	const curr = result.equityCurve[i]!;
	if (!prev.isZero()) {
		returns.push(curr.div(prev).sub(Decimal.from("1")));
	}
}
const sharpe = calcSharpe(returns);            // annualized (default 252 periods/year)
const calmar = calcCalmarRatio(result.equityCurve, result.equityCurve.length);
```
