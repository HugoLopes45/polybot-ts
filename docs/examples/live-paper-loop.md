# Live Paper Loop

Demonstrates a full strategy tick loop with `PaperExecutor` — no real money, no API keys.

```typescript
import type { SignalDetector, DetectorContextLike, SdkOrderIntent } from "@polybot/sdk";
import {
  StrategyBuilder,
  PaperExecutor,
  TestContextBuilder,
  Decimal,
  MarketSide,
  marketTokenId,
} from "@polybot/sdk";

interface SpreadSignal {
  readonly spread: Decimal;
}

const detector: SignalDetector<unknown, SpreadSignal> = {
  name: "SpreadDetector",

  detectEntry(ctx: DetectorContextLike): SpreadSignal | null {
    const spread = ctx.spread(MarketSide.Yes);
    if (spread !== null && spread.gt(Decimal.from("0.03"))) {
      return { spread };
    }
    return null;
  },

  toOrder(_signal: SpreadSignal, ctx: DetectorContextLike): SdkOrderIntent {
    const bestAsk = ctx.bestAsk(MarketSide.Yes);
    return {
      conditionId: ctx.conditionId,
      tokenId: marketTokenId("yes-token"),
      side: MarketSide.Yes,
      direction: "buy" as const,
      price: bestAsk ?? Decimal.from("0.50"),
      size: Decimal.from("10"),
    };
  },
};

const executor = new PaperExecutor({});
const strategy = StrategyBuilder.create()
  .withDetector(detector)
  .withExecutor(executor)
  .build();

// Simulate 10 ticks with varying prices
const prices = [
  { bid: "0.45", ask: "0.50" },
  { bid: "0.46", ask: "0.51" },
  { bid: "0.44", ask: "0.49" },
  // ... more ticks
];

for (let i = 0; i < prices.length; i++) {
  const p = prices[i];
  const context = new TestContextBuilder()
    .withBestBid(MarketSide.Yes, Decimal.from(p.bid))
    .withBestAsk(MarketSide.Yes, Decimal.from(p.ask))
    .withOraclePrice(Decimal.from("0.55"))
    .build();

  await strategy.tick(context);
  console.log(`Tick ${i + 1}: ${executor.fillHistory().length} fills`);
}
```

## Key Concepts

- **`SignalDetector`** — the only interface you implement: `detectEntry()` + `toOrder()`
- **`PaperExecutor`** — simulates fills without real API calls
- **`TestContextBuilder`** — creates synthetic market snapshots for testing
- **`StrategyBuilder`** — wires detector + executor (+ optional guards/exits)

## Running

```bash
npx tsx examples/live-paper-loop.ts
```
