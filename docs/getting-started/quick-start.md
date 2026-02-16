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

## What's Next?

- [Authentication](/getting-started/authentication) — Set up real API keys
- [Paper Trading](/getting-started/paper-trading) — Configure PaperExecutor
- [Risk Management](/guides/risk-management) — Add guards to protect your capital
