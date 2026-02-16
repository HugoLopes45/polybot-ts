# Simple Arbitrage

A basic arbitrage strategy detecting price differences between oracle and orderbook.

```typescript
import type { SignalDetector, DetectorContextLike, SdkOrderIntent } from "@polybot/sdk";
import { buyYes, Decimal, MarketSide, marketTokenId } from "@polybot/sdk";

/**
 * Signal detector that looks for arbitrage opportunities
 * between oracle price and best ask.
 */
const simpleArb: SignalDetector<unknown, { price: Decimal; edge: number }> = {
  name: "SimpleArb",

  /**
   * detectEntry checks for arbitrage opportunities.
   * Returns a signal if oracle price exceeds ask by more than threshold.
   */
  detectEntry(ctx) {
    const oracle = ctx.oraclePrice();
    const ask = ctx.bestAsk(MarketSide.Yes);
    if (!oracle || !ask) return null;

    const edge = oracle.sub(ask).div(ask).toNumber();
    return edge > 0.02 ? { price: ask, edge } : null;
  },

  /**
   * Converts signal into a buy order.
   */
  toOrder(signal, ctx) {
    const size = Decimal.from(String(Math.floor(signal.edge * 1000)));
    return buyYes(ctx.conditionId, marketTokenId("yes-token"), signal.price, size);
  },
};

export { simpleArb };
```

## How It Works

1. **detectEntry** fetches oracle price and best ask
2. Calculates edge: `(oracle - ask) / ask`
3. Returns signal if edge > 2%
4. **toOrder** converts to buy order with size based on edge

## Running

```bash
pnpm examples:paper simple-arb
```

## Expected Output

```
[SimpleArb] Edge detected: 2.5%
[SimpleArb] Order submitted: buy 25 YES @ 0.68
[PaperExecutor] Order filled: 25 @ 0.6834
```
