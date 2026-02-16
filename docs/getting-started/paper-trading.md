# Paper Trading

Test your strategies without risking real money using `PaperExecutor`.

## Basic Setup

```typescript
import { PaperExecutor } from "@polybot/sdk";

const executor = new PaperExecutor({
	fillProbability: 0.95,
	slippageBps: 5,
	fillDelayMs: 100,
	maxOrderAgeMs: 60000,
});
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `fillProbability` | `number` | `1.0` | Probability of order fill (0-1) |
| `slippageBps` | `number` | `0` | Slippage in basis points |
| `fillDelayMs` | `number` | `0` | Simulated fill delay |
| `clock` | `Clock` | `SystemClock` | Injectable clock for testing |
| `maxFillHistory` | `number` | `10000` | Maximum fill records to keep |
| `maxOrderAgeMs` | `number` | `0` | Maximum age before auto-cancel (0 = disabled) |

## Accessing Fill History

```typescript
const executor = new PaperExecutor({
	fillProbability: 0.95,
	slippageBps: 5,
});

const strategy = StrategyBuilder.create()
	.withDetector(myDetector)
	.withExecutor(executor)
	.build();

// After running ticks...
const fills = executor.fillHistory();

fills.forEach((fill) => {
	// fill.intent: SdkOrderIntent
	// fill.result: OrderResult
	// fill.timestampMs: number
});
```

## Using a Journal

```typescript
import { FileJournal, StrategyBuilder } from "@polybot/sdk";

const journal = new FileJournal({
	filePath: "./journal.jsonl",
});

const strategy = StrategyBuilder.create()
	.withDetector(myDetector)
	.withExecutor(executor)
	.withJournal(journal)
	.build();

// After running strategy...
const entries = await journal.read();

entries.forEach((entry) => {
	// entry.type: "entry_signal" | "order_submitted" | "position_opened" | etc.
	// entry.timestamp: number
});
```

## Transitioning to Live

```typescript
import { ClobExecutor, TokenBucketRateLimiter, createCredentials } from "@polybot/sdk";

const credentials = createCredentials({
	apiKey: process.env.POLYBOT_API_KEY!,
	secret: process.env.POLYBOT_SECRET!,
	passphrase: process.env.POLYBOT_PASSPHRASE!,
});

const rateLimiter = TokenBucketRateLimiter.create(10, 20);

// Replace PaperExecutor with ClobExecutor
const liveExecutor = new ClobExecutor(clobClient, rateLimiter);

// Same strategy interface
const strategy = StrategyBuilder.create()
	.withDetector(myDetector)
	.withExecutor(liveExecutor)
	.build();
```

## Best Practices

1. **Match production conditions** — Set slippage to expected real-world values
2. **Use realistic fill probabilities** — Don't set to 1.0 for accurate testing
3. **Record journal results** — Analyze fills, P&L, and decision logic
4. **Test edge cases** — Network failures, rate limits, extreme prices

## What's Next?

- [Quick Start](/getting-started/quick-start) — Full example
- [Risk Management](/guides/risk-management) — Protect your capital
