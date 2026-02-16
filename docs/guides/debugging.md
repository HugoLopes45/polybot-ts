# Debugging

Diagnostic techniques for troubleshooting strategy issues.

## Enable Verbose Logging

The SDK uses Pino for structured logging. Configure log level to increase verbosity:

```typescript
import { createLogger } from "@polybot/sdk";

const logger = createLogger({ level: "debug" }); // trace | debug | info | warn | error
logger.info("Strategy started", { conditionId: "0x123" });
logger.debug("Orderbook snapshot", { bid: "0.45", ask: "0.55" });
```

All log output is structured JSON — suitable for log aggregation services like Datadog or Grafana Loki.

**Log levels**:
- `trace`: Very verbose, includes all internal operations
- `debug`: Detailed diagnostic information
- `info`: Standard operational messages (default)
- `warn`: Warning conditions that don't prevent execution
- `error`: Error conditions requiring attention

## Interpreting Guard Rejections

When `GuardPipeline.evaluate()` blocks an order, it returns a verdict with diagnostic information:

```typescript
import { GuardPipeline } from "@polybot/sdk";

const verdict = guardPipeline.evaluate(context);

if (verdict.type === "block") {
	logger.warn("Guard blocked trade", {
		guard: verdict.guard,           // Name of the guard that blocked
		reason: verdict.reason,          // Human-readable explanation
		recoverable: verdict.recoverable, // Can retry later?
		currentValue: verdict.currentValue, // Optional: metric value
		threshold: verdict.threshold,    // Optional: limit that was exceeded
	});
}
```

**Common guard blocks**:
- `MaxSpreadGuard`: Spread too wide → wait for tighter market
- `BalanceGuard`: Insufficient funds → deposit or close positions
- `MaxPositionsGuard`: Too many open positions → wait for exits
- `KillSwitchGuard`: Loss limit exceeded → strategy halted
- `CooldownGuard`: Not enough time since last trade → wait

## Tracing the Order FSM

Orders follow a 7-state lifecycle:

```
Created → Submitted → Open → PartiallyFilled → Filled
                        │                         ↑
                        └→ Cancelled ←─────────────┘
                        └→ Expired
```

Subscribe to order lifecycle events to trace state transitions:

```typescript
import { EventDispatcher } from "@polybot/sdk";

const dispatcher = new EventDispatcher();

dispatcher.onSdk("order_placed", (event) => {
	logger.info("Order submitted", {
		clientOrderId: event.clientOrderId,
		tokenId: event.tokenId,
		side: event.side,
		price: event.price,
		size: event.size,
	});
});

dispatcher.onSdk("fill_received", (event) => {
	logger.info("Fill received", {
		clientOrderId: event.clientOrderId,
		filledSize: event.filledSize,
		fillPrice: event.fillPrice,
	});
});

dispatcher.onSdk("order_cancelled", (event) => {
	logger.info("Order cancelled", {
		clientOrderId: event.clientOrderId,
		reason: event.reason,
	});
});
```

## Using Events for Debugging

`EventDispatcher` has a wildcard handler that captures all SDK events:

```typescript
dispatcher.onSdk("*", (event) => {
	logger.debug("SDK event", { type: event.type, event });
});
```

**Key event types**:

| Event | Description |
|-------|-------------|
| `order_placed` | Order submitted to exchange |
| `order_cancelled` | Order cancellation confirmed |
| `fill_received` | Fill notification received |
| `position_opened` | New position created |
| `position_closed` | Position fully exited |
| `position_reduced` | Position partially closed |
| `guard_blocked` | Risk guard rejected entry |
| `state_changed` | Strategy state transition |
| `watchdog_alert` | Connectivity watchdog alert |
| `error_occurred` | Error in strategy execution |
| `tick_dropped` | Tick rejected by guards |

**Debugging pattern — capture all events to file**:

```typescript
import { writeFileSync } from "node:fs";

const events: unknown[] = [];

dispatcher.onSdk("*", (event) => {
	events.push({ timestamp: Date.now(), event });
});

// On shutdown, dump to file for post-mortem analysis
process.on("SIGINT", () => {
	writeFileSync("debug-events.json", JSON.stringify(events, null, 2));
	process.exit(0);
});
```

## Common Issues

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| No trades executing | Guards blocking | Log guard rejections, check diagnostics (`currentValue`, `threshold`) |
| Orders stuck in Submitted | Executor connectivity issue | Check WebSocket health, verify API credentials |
| Position P&L wrong | Entry price mismatch | Verify `entryPrice` in `SdkPosition`, check fee model configuration |
| Strategy not ticking | Lifecycle state issue | Verify strategy is in `Active` state, check `start()` was called |
| High latency alerts | Slow detector or guards | Use `LatencyHistogram` to profile tick duration, optimize hot paths |
| Duplicate orders | Idempotency guard disabled | Enable `IdempotencyGuard` with appropriate TTL |
| Unexpected exits | Exit pipeline triggering | Log exit pipeline evaluation, check exit guard conditions |

**Debugging "No trades executing"**:

```typescript
const verdict = guardPipeline.evaluate(context);

if (verdict.type === "block") {
	console.error("Trade blocked:", {
		guard: verdict.guard,
		reason: verdict.reason,
		current: verdict.currentValue,
		limit: verdict.threshold,
	});
	// Example: MaxSpreadGuard blocked, current=8%, limit=5%
	// → Wait for tighter spread or adjust MaxSpreadGuard threshold
}
```

**Debugging "Orders stuck in Submitted"**:

```typescript
dispatcher.onSdk("watchdog_alert", (event) => {
	logger.error("Connectivity issue", {
		component: event.component,
		message: event.message,
	});
	// Check WebSocket connection, API rate limits, network issues
});
```

## Using TestContextBuilder for Isolation

Use `TestContextBuilder` to create controlled environments for reproducing issues:

```typescript
import { TestContextBuilder, Decimal } from "@polybot/sdk";

// Reproduce issue: guard rejects when spread > 5%
const ctx = new TestContextBuilder()
	.withBestBid("yes", Decimal.from("0.40"))
	.withBestAsk("yes", Decimal.from("0.50")) // 10% spread
	.withBalance(Decimal.from("1000"))
	.build();

const verdict = guardPipeline.evaluate(ctx);
// verdict.type === "block", guard === "MaxSpreadGuard"
```

This isolates the issue from live market data and makes it reproducible in tests.

## PaperExecutor for Testing

Use `PaperExecutor` to test strategies without real orders:

```typescript
import { PaperExecutor } from "@polybot/sdk";

const executor = new PaperExecutor({
	fillProbability: 1.0,   // Always fill
	slippageBps: 5,         // 0.05% slippage
	fillDelayMs: 0,         // Instant fills
});

// Submit orders, inspect results
const result = await executor.submit(intent);
if (result.ok) {
	console.log("Fill:", result.val);
}

// Inspect fill history
for (const fill of executor.fillHistory()) {
	console.log("Intent:", fill.intent);
	console.log("Result:", fill.result);
	console.log("Timestamp:", fill.timestampMs);
}
```

**Use cases**:
- Test strategy logic without risking capital
- Reproduce issues with deterministic fills (use `FakeClock` for time control)
- Verify order submission logic before live deployment

## Debugging Tick Loop Issues

The strategy tick loop is the heartbeat of your strategy. Capture tick completion events to diagnose issues:

```typescript
import { LatencyHistogram } from "@polybot/sdk";

const tickLatency = LatencyHistogram.create();

strategy.onSdk("tick_complete", (event) => {
	tickLatency.recordMs(event.durationMs);

	// Alert if p95 exceeds 50ms
	if (tickLatency.p95() > 50) {
		logger.warn("High tick latency", {
			p50: tickLatency.p50(),
			p95: tickLatency.p95(),
			p99: tickLatency.p99(),
			samples: tickLatency.count,
		});
	}
});
```

**Tick loop failure modes**:
- **Detector throws**: Unhandled exception in signal detector → tick dropped, strategy continues
- **Guard throws**: Unhandled exception in guard → tick dropped, strategy continues
- **Exit pipeline throws**: Unhandled exception in exit → tick dropped, positions may not be closed
- **Strategy halted**: Non-recoverable guard blocks → strategy enters `Halted` state

All user-supplied code (detector, guards, exits) is wrapped in try-catch — exceptions won't crash the tick loop but are emitted as `error_occurred` events.

## Example: Full Debugging Session

```typescript
import { createLogger, EventDispatcher, GuardPipeline, LatencyHistogram } from "@polybot/sdk";

// 1. Enable verbose logging
const logger = createLogger({ level: "debug" });

// 2. Capture all events
const dispatcher = new EventDispatcher();
const events: unknown[] = [];

dispatcher.onSdk("*", (event) => {
	events.push({ timestamp: Date.now(), event });
	logger.debug("Event", { type: event.type, event });
});

// 3. Log guard blocks with diagnostics
dispatcher.onSdk("guard_blocked", (event) => {
	logger.warn("Guard blocked trade", {
		guard: event.guard,
		reason: event.reason,
		recoverable: event.recoverable,
		diagnostics: event.diagnostics,
	});
});

// 4. Log order state transitions
dispatcher.onSdk("order_placed", (event) => {
	logger.info("Order submitted", { clientOrderId: event.clientOrderId });
});

dispatcher.onSdk("fill_received", (event) => {
	logger.info("Fill received", { clientOrderId: event.clientOrderId });
});

// 5. Track tick latency
const tickLatency = LatencyHistogram.create();

dispatcher.onSdk("tick_complete", (event) => {
	tickLatency.recordMs(event.durationMs);
	if (tickLatency.p95() > 50) {
		logger.warn("High tick latency", { p95: tickLatency.p95() });
	}
});

// 6. Dump events on shutdown
process.on("SIGINT", () => {
	logger.info("Shutdown", { totalEvents: events.length });
	writeFileSync("debug-events.json", JSON.stringify(events, null, 2));
	process.exit(0);
});
```

This setup captures everything you need for post-mortem analysis: event timeline, guard diagnostics, tick latency, and structured logs.
