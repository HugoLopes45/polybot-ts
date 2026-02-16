# Signal Detector

The `SignalDetector` interface is the core of your trading strategy.

## Interface

```typescript
import type { SignalDetector, DetectorContextLike, SdkOrderIntent } from "@polybot/sdk";

interface SignalDetector<TConfig, TSignal> {
  name: string;

  detectEntry(ctx: DetectorContextLike): TSignal | null;

  toOrder(signal: TSignal, ctx: DetectorContextLike): SdkOrderIntent;
}
```

## Example: Oracle Arbitrage

```typescript
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

## DetectorContextLike Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `conditionId` | `ConditionId` | Current market condition ID |
| `nowMs()` | `number` | Current timestamp in milliseconds |
| `spot()` | `Decimal \| null` | Current spot price |
| `oraclePrice()` | `Decimal \| null` | Current oracle price |
| `timeRemainingMs()` | `number` | Time until market expiry (ms) |
| `bestBid(side)` | `Decimal \| null` | Best bid for given side |
| `bestAsk(side)` | `Decimal \| null` | Best ask for given side |
| `spread(side)` | `Decimal \| null` | Spread for given side |

## Contract

The `detectEntry` → `toOrder` contract:

1. **detectEntry** returns a signal when entry criteria are met
2. **toOrder** converts the signal into an order intent
3. The SDK handles all risk guards, execution, and position tracking

## What's Next?

- [Architecture](/concepts/architecture) — System overview
- [Risk Management](/guides/risk-management) — Guard pipeline
