# Conservative Market Making

A market-making strategy using the conservative preset with tight spreads.

```typescript
import {
  Decimal,
  type DetectorContextLike,
  MemoryJournal,
  PaperExecutor,
  type SdkOrderIntent,
  type SignalDetector,
  conservative,
  marketTokenId,
} from "@polybot/sdk";

interface MmSignal {
  mid: number;
  side: "yes" | "no";
}

const mmDetector: SignalDetector<unknown, MmSignal> = {
  name: "conservative-mm",

  detectEntry(ctx: DetectorContextLike): MmSignal | null {
    const bid = ctx.bestBid("yes");
    const ask = ctx.bestAsk("yes");
    if (!bid || !ask) return null;

    const sp = ask.sub(bid);
    if (sp.toNumber() < 0.02) return null; // skip tight spreads

    const mid = bid.add(ask).div(Decimal.from(2)).toNumber();
    return { mid, side: "yes" };
  },

  toOrder(signal: MmSignal, ctx: DetectorContextLike): SdkOrderIntent {
    return {
      conditionId: ctx.conditionId,
      tokenId: marketTokenId("yes-token"),
      side: signal.side,
      direction: "buy",
      price: Decimal.from(signal.mid.toFixed(4)),
      size: Decimal.from("5"),
    };
  },
};

const journal = new MemoryJournal();
const executor = new PaperExecutor({ fillProbability: 1, slippageBps: 2 });

const strategy = conservative()
  .withDetector(mmDetector)
  .withExecutor(executor)
  .withJournal(journal)
  .build();
```

## How It Works

1. **detectEntry** fetches best bid and ask for YES tokens
2. Skips if spread is too tight (< 2 cents) — not profitable to market-make
3. Calculates midpoint price between bid and ask
4. **toOrder** places a small buy at the midpoint
5. Uses the `conservative()` preset which includes safety guards: kill switch, circuit breaker, cooldown, max positions

## Key Concepts

- **Conservative preset**: Pre-configured `GuardPipeline` with tight risk limits
- **MemoryJournal**: In-memory trade journal for development/testing
- **PaperExecutor**: Simulated execution with configurable fill probability and slippage

## Running

```bash
npx tsx examples/conservative-mm.ts
```
