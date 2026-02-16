# FAQ

Common questions and troubleshooting for the Polybot SDK.

## Why does my strategy never enter a trade?

Check these common causes in order:

1. **Guards blocking entry** — Add logging to your guard pipeline to see which guard blocks. Use `verdict.reason` and `verdict.diagnostic` for details.
2. **Detector returning null** — Your `detectEntry()` may never find a signal. Log the context values (oracle price, best ask, spread) to verify.
3. **No oracle price** — `ctx.oraclePrice()` returns null if no oracle is configured.
4. **PaperExecutor fill probability** — If set below 1.0, some orders won't fill. Set `fillProbability: 1` for testing.
5. **Cooldown guard** — `CooldownGuard` blocks entries for N seconds after each trade. Check if it's too aggressive.

## Why are my Decimal calculations wrong?

Always construct Decimals from strings, never from JavaScript `number`:

```typescript
// WRONG — loses precision
const bad = Decimal.from(0.1 + 0.2); // 0.30000000000000004

// CORRECT — exact precision
const good = Decimal.from("0.1").add(Decimal.from("0.2")); // 0.3
```

The SDK uses 18-digit fixed-point precision. JavaScript `number` has ~15 significant digits and suffers from binary floating-point rounding.

## How do I test without real money?

Use `PaperExecutor` — it simulates order fills without connecting to any exchange:

```typescript
import { PaperExecutor } from "@polybot/sdk";

const executor = new PaperExecutor({
  fillProbability: 1,   // Always fill (use < 1 to simulate partial fills)
  slippageBps: 5,       // 5 basis points of slippage
});
```

For historical testing, use the backtest engine:

```typescript
import { runBacktest, priceTrend, Decimal } from "@polybot/sdk";

const result = runBacktest(
  { initialBalance: Decimal.from("1000") },
  priceTrend({ start: 0.5, end: 0.7, steps: 100 }),
  myDetector,
);
result.finalBalance; // End balance
result.trades;       // All trade records
```

## TypeScript errors with branded types

Branded types (`ConditionId`, `MarketTokenId`, etc.) cannot be assigned from raw strings:

```typescript
// WRONG — type error
const cid: ConditionId = "0x123";

// CORRECT — use factory function
import { conditionId } from "@polybot/sdk";
const cid = conditionId("0x123");
```

This is by design — branded types prevent accidentally passing a `MarketTokenId` where a `ConditionId` is expected.

## WebSocket keeps disconnecting

The `WsManager` has built-in reconnection with exponential backoff. Common issues:

1. **Rate limiting** — Polymarket limits WebSocket connections. Use `RateLimiterManager` with the Polymarket preset.
2. **Heartbeat timeout** — If the server doesn't send data for too long, the connection is considered dead. The SDK auto-reconnects.
3. **Network issues** — Check your firewall/proxy settings.

## How do I add a custom indicator?

Follow the TDD pattern:

1. Write a test in `src/analytics/my-indicator.test.ts`
2. Implement as a pure function: `(candles: Candle[], period: number) => Decimal | null`
3. Export from `src/analytics/index.ts`
4. All inputs/outputs should use `Decimal` for precision

See [Adding Indicators](/contributing/adding-indicators) for a full tutorial.

## Result type — how do I unwrap?

```typescript
import { isOk, isErr, unwrap } from "@polybot/sdk";

const result = manager.open(cid, tokenId, side, price, size, now);

// Option 1: Pattern match
if (isOk(result)) {
  const manager = result.value;
}

// Option 2: Unwrap (throws if Err)
const manager = unwrap(result);

// Option 3: Check error
if (isErr(result)) {
  const error = result.error;
}
```

## What's the difference between build() and buildProduction()?

`StrategyBuilder.build()` creates a strategy with default settings suitable for development and testing.

For production, configure explicit guards, exits, journal, and executor:

```typescript
const strategy = StrategyBuilder.create()
  .withDetector(myDetector)
  .withGuards(GuardPipeline.conservative())
  .withExits(myExitPipeline)
  .withExecutor(prodExecutor)
  .withJournal(fileJournal)
  .build();
```

There is no separate `buildProduction()` method — the builder is the same. The difference is what you configure: paper vs real executor, memory vs file journal, and which guard preset you choose.
