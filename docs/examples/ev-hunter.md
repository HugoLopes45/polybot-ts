# EV Hunter

Expected value hunting strategy that calculates edge and sizes positions accordingly.

```typescript
import type { SignalDetector, DetectorContextLike, SdkOrderIntent } from "@polybot/sdk";
import { buyYes, Decimal, MarketSide, marketTokenId } from "@polybot/sdk";

/**
 * EV Hunter calculates expected value and sizes positions
 * based on Kelly criterion.
 */
const evHunter: SignalDetector<unknown, { price: Decimal; size: Decimal; ev: number }> = {
  name: "EVHunter",

  detectEntry(ctx) {
    const oracle = ctx.oraclePrice();
    const ask = ctx.bestAsk(MarketSide.Yes);
    if (!oracle || !ask) return null;

    // Calculate implied probability from ask
    const impliedProb = Decimal.from(1).sub(ask.div(oracle)).toNumber();

    // Calculate EV: (win_prob * payout) - (loss_prob * stake)
    const payout = oracle.toNumber();
    const winEV = impliedProb * payout;
    const lossProb = 1 - impliedProb;
    const ev = winEV - lossProb;

    // Only trade if EV > 5%
    if (ev > 0.05) {
      // Size based on Kelly fraction
      const kellySize = Math.floor(ev * 1000);
      return {
        price: ask,
        size: Decimal.from(String(kellySize)),
        ev,
      };
    }

    return null;
  },

  toOrder(signal, ctx) {
    return buyYes(
      ctx.conditionId,
      marketTokenId("yes-token"),
      signal.price,
      signal.size
    );
  },
};

export { evHunter };
```

## How It Works

1. **detectEntry** calculates implied probability from ask price
2. Computes expected value: `(win_prob * payout) - (loss_prob * stake)`
3. Only enters if EV > 5%
4. Sizes position proportionally to EV (Kelly-inspired)

## Running

```bash
pnpm examples:paper ev-hunter
```

## Expected Output

```
[EVHunter] EV calculated: 8.2%
[EVHunter] Position size: 82
[EVHunter] Order submitted: buy 82 YES @ 0.65
```
