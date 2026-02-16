# Quick Start

Build a complete trading bot in under 15 minutes using `PaperExecutor` for testing without a Polymarket account.

## Step 1: Implement Your Signal Detector

The `SignalDetector` interface is the **only** interface you need to implement:

```typescript
import type { SignalDetector, DetectorContextLike, SdkOrderIntent } from "@polybot/sdk";
import { buyYes, Decimal, MarketSide, marketTokenId } from "@polybot/sdk";

const oracleArb: SignalDetector<unknown, { price: Decimal; edge: number }> = {
	name: "OracleArbitrage",

	detectEntry(ctx) {
		const oracle = ctx.oraclePrice();
		const ask = ctx.bestAsk(MarketSide.Yes);
		if (!oracle || !ask) return null;

		const edge = oracle.sub(ask).div(ask).toNumber();
		return edge > 0.02 ? { price: ask, edge } : null;
	},

	toOrder(signal, ctx) {
		const size = Decimal.from(String(Math.floor(signal.edge * 1000)));
		return buyYes(ctx.conditionId, marketTokenId("yes-token"), signal.price, size);
	},
};
```

## Step 2: Build Your Strategy

```typescript
import { StrategyBuilder, PaperExecutor } from "@polybot/sdk";

const executor = new PaperExecutor({
	fillProbability: 0.95,
	slippageBps: 5,
});

const strategy = StrategyBuilder.create()
	.withDetector(oracleArb)
	.withExecutor(executor)
	.build();
```

## Step 3: Run the Strategy Tick Loop

```typescript
import { TestContextBuilder, Decimal, MarketSide } from "@polybot/sdk";

// Build a test context
const context = new TestContextBuilder()
	.withOraclePrice(Decimal.from("0.70"))
	.withBestBid(MarketSide.Yes, Decimal.from("0.65"))
	.withBestAsk(MarketSide.Yes, Decimal.from("0.68"))
	.build();

// Execute a single tick
await strategy.tick(context);

// Access fill history from PaperExecutor
const fills = executor.fillHistory();
// fills: Array of { intent, result, timestampMs }
```

## Step 4: Add Risk Management

Protect your capital with guards that block unsafe trades:

```typescript
import {
	StrategyBuilder, PaperExecutor, GuardPipeline,
	MaxSpreadGuard, KillSwitchGuard, CooldownGuard, Decimal,
} from "@polybot/sdk";

const guards = GuardPipeline.create()
	.with(MaxSpreadGuard.normal())           // Block if spread > 5%
	.with(CooldownGuard.fromSecs(30))        // 30s between trades
	.with(KillSwitchGuard.create(3, 5));     // Halt at 3% soft / 5% hard daily loss

const strategy = StrategyBuilder.create()
	.withDetector(oracleArb)
	.withGuards(guards)
	.withExecutor(executor)
	.build();
```

## Step 5: Run Your First Backtest

Test your detector on synthetic historical data:

```typescript
import type { BacktestDetector, ReplayTick, EntryState } from "@polybot/sdk";
import { runBacktest, meanReverting, Decimal, calcWinRate, calcMaxDrawdown } from "@polybot/sdk";

const detector: BacktestDetector = {
	shouldEnter(tick: ReplayTick) {
		if (tick.bid.lt(Decimal.from("0.45"))) {
			return { direction: "buy" as const, size: Decimal.from("10") };
		}
		return null;
	},
	shouldExit(tick: ReplayTick, entry: EntryState) {
		const roi = tick.bid.sub(entry.entryPrice).div(entry.entryPrice);
		return roi.gt(Decimal.from("0.10"));
	},
};

const ticks = meanReverting(
	{ startMs: 0, tickIntervalMs: 1000, numTicks: 500, side: "yes" },
	0.50, 0.05, 0.02,
);

const result = runBacktest({ initialBalance: Decimal.from("1000") }, ticks, detector);

console.log(`Trades: ${result.tradeCount}, P&L: ${result.totalPnl.toString()}`);
console.log(`Win Rate: ${calcWinRate(result.trades.map(t => t.pnl)).toString()}`);
console.log(`Max Drawdown: ${calcMaxDrawdown(result.equityCurve).toString()}`);
```

## What's Next?

- [Authentication](/getting-started/authentication) — Set up real API keys
- [Paper Trading](/getting-started/paper-trading) — Configure PaperExecutor
- [Risk Management](/guides/risk-management) — 15 built-in guards
- [Exit Strategies](/guides/exit-strategies) — 7 automated exit policies
- [Backtesting](/guides/backtesting) — Full guide with slippage models and metrics
- [Strategy Builder](/guides/strategy-builder) — Presets and tick loop details
