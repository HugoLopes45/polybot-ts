# Configuration

Configure the SDK for your trading needs.

## Basic Configuration

```typescript
import { SdkConfig, DEFAULT_SDK_CONFIG } from "@polybot/sdk";

const config: SdkConfig = {
	...DEFAULT_SDK_CONFIG,
	name: "my-strategy",
	tickIntervalMs: 5000,
	maxPositions: 3,
	maxOrderSizeUsdc: 100,
	maxDailyLossUsdc: 500,
	paperMode: true,
	maxSlippageBps: 50,
};
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | `"unnamed-strategy"` | Human-readable strategy name |
| `tickIntervalMs` | `number` | `1000` | Tick interval in milliseconds |
| `maxPositions` | `number` | `5` | Maximum concurrent open positions |
| `maxOrderSizeUsdc` | `number` | `100` | Maximum single order size in USDC |
| `maxDailyLossUsdc` | `number` | `500` | Maximum daily loss before kill switch |
| `paperMode` | `boolean` | `true` | Whether to enable paper trading mode |
| `maxSlippageBps` | `number` | `undefined` | Maximum slippage tolerance in basis points |

## Environment Variables

```bash
POLYBOT_NAME=my-strategy
POLYBOT_TICK_INTERVAL_MS=5000
POLYBOT_MAX_POSITIONS=3
POLYBOT_MAX_ORDER_SIZE_USDC=100
POLYBOT_MAX_DAILY_LOSS_USDC=500
POLYBOT_PAPER_MODE=true
POLYBOT_MAX_SLIPPAGE_BPS=50
```

## Paper vs Live Mode

```typescript
import { PaperExecutor, ClobExecutor, createCredentials, TokenBucketRateLimiter } from "@polybot/sdk";

// Paper trading (testing)
const paperExecutor = new PaperExecutor({
	fillProbability: 0.95,
	slippageBps: 5,
});

// Live trading
const credentials = createCredentials({
	apiKey: process.env.POLYBOT_API_KEY!,
	secret: process.env.POLYBOT_SECRET!,
	passphrase: process.env.POLYBOT_PASSPHRASE!,
});

const rateLimiter = TokenBucketRateLimiter.create(10, 20);
const liveExecutor = new ClobExecutor(clobClient, rateLimiter);
```

## What's Next?

- [Paper Trading](/getting-started/paper-trading) — Test strategies safely
- [Risk Management](/guides/risk-management) — Configure guards
