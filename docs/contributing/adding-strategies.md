# Adding a Strategy

Learn how to create a complete trading strategy using the SDK.

## What is a Strategy?

A strategy combines a signal detector, guard pipeline, exit pipeline, and executor into a runnable bot.

## Step 1: Implement SignalDetector

```typescript
import type { SignalDetector, DetectorContextLike, SdkOrderIntent } from "@polybot/sdk";
import { buyYes, sellYes, Decimal, MarketSide, marketTokenId } from "@polybot/sdk";

const myStrategy: SignalDetector<unknown, { side: MarketSide; price: Decimal; size: Decimal }> = {
  name: "MyStrategy",

  detectEntry(ctx) {
    const oracle = ctx.oraclePrice();
    const ask = ctx.bestAsk(MarketSide.Yes);
    const bid = ctx.bestBid(MarketSide.Yes);

    if (!oracle || !ask || !bid) return null;

    // Buy when oracle > ask (arbitrage)
    const buyEdge = oracle.sub(ask).div(ask).toNumber();
    if (buyEdge > 0.02) {
      return { side: MarketSide.Yes, price: ask, size: Decimal.from("100") };
    }

    // Sell when oracle < bid
    const sellEdge = bid.sub(oracle).div(oracle).toNumber();
    if (sellEdge > 0.02) {
      return { side: MarketSide.No, price: bid, size: Decimal.from("100") };
    }

    return null;
  },

  toOrder(signal, ctx) {
    if (signal.side === MarketSide.Yes) {
      return buyYes(ctx.conditionId, marketTokenId("yes-token"), signal.price, signal.size);
    }
    return sellYes(ctx.conditionId, marketTokenId("no-token"), signal.price, signal.size);
  },
};
```

## Step 2: Configure Guards and Exits

```typescript
import { GuardPipeline, ExitPipeline, MaxSpreadGuard, TakeProfitExit, StopLossExit } from "@polybot/sdk";

const guards = GuardPipeline.standard();
const exits = ExitPipeline.create()
  .with(new TakeProfitExit(Decimal.from("0.20")))
  .with(new StopLossExit(Decimal.from("-0.10")));
```

## Step 3: Build the Strategy

```typescript
import { StrategyBuilder } from "@polybot/sdk";

const strategy = StrategyBuilder.create()
  .withDetector(myStrategy)
  .withGuards(guards)
  .withExits(exits)
  .withExecutor(new PaperExecutor())
  .build();
```

## Step 4: Run It

```typescript
import { BuiltStrategy } from "@polybot/sdk";

const bot = new BuiltStrategy(strategy);
await bot.start();
```

## Testing with TestRunner

```typescript
import { TestRunner, TestContextBuilder } from "@polybot/sdk";

const context = new TestContextBuilder()
  .withOraclePrice(Decimal.from("0.70"))
  .build();

// Run a tick with your strategy
await strategy.tick(context);
```
