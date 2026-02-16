# Scanner Strategy

Multi-market scanning strategy that finds and trades the best market by edge/spread ratio.

```typescript
import {
  Decimal,
  type DetectorContextLike,
  type MarketInfo,
  type OrderbookSnapshot,
  PaperExecutor,
  type SdkOrderIntent,
  type SignalDetector,
  StrategyBuilder,
  marketTokenId,
  scan,
} from "@polybot/sdk";

const MIN_SCORE = 0.5;

export function findBestMarket(
  markets: readonly MarketInfo[],
  books: ReadonlyMap<string, OrderbookSnapshot>,
): { conditionId: string; edge: number; score: number } | null {
  const results = scan(markets, books);
  const best = results[0];
  if (!best || best.score < MIN_SCORE) return null;

  return {
    conditionId: best.conditionId as string,
    edge: best.edge.toNumber(),
    score: best.score,
  };
}

const scanDetector: SignalDetector<unknown, { edge: number; score: number }> = {
  name: "scanner",

  detectEntry(ctx: DetectorContextLike) {
    const oracle = ctx.oraclePrice();
    const ask = ctx.bestAsk("yes");
    if (!oracle || !ask) return null;

    const edge = oracle.sub(ask).abs().toNumber();
    if (edge < 0.02) return null;

    return { edge, score: edge * 100 };
  },

  toOrder(_signal, ctx: DetectorContextLike): SdkOrderIntent {
    const ask = ctx.bestAsk("yes");
    return {
      conditionId: ctx.conditionId,
      tokenId: marketTokenId("yes-token"),
      side: "yes",
      direction: "buy",
      price: ask ?? Decimal.from("0.50"),
      size: Decimal.from("15"),
    };
  },
};

const executor = new PaperExecutor({ fillProbability: 0.9, slippageBps: 10 });

const strategy = StrategyBuilder.create()
  .withDetector(scanDetector)
  .withExecutor(executor)
  .build();
```

## How It Works

1. **findBestMarket** scans all available markets using `scan()` which scores by edge/spread ratio
2. Filters markets below the minimum score threshold
3. **detectEntry** checks each market for oracle-to-ask edge > 2%
4. **toOrder** places a buy order at the current ask price

## Key Concepts

- **Market scanning**: `scan()` scores markets by edge-to-spread ratio
- **Score threshold**: Only trades markets scoring above 0.5
- **PaperExecutor**: 90% fill probability, 10bps slippage simulates realistic conditions

## Running

```bash
npx tsx examples/scanner-strategy.ts
```
