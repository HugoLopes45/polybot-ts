# Observability

Latency tracking and structured logging for production monitoring.

## Latency Histogram

Track operation latencies with log-scale bucketing and percentile estimates:

```typescript
import { LatencyHistogram } from "@polybot/sdk";

const hist = LatencyHistogram.create();

// Record latencies
hist.recordMs(2.5);   // 2.5 milliseconds
hist.recordMs(1.2);
hist.recordMs(15.8);
hist.recordUs(500);   // 500 microseconds

// Query percentiles (in milliseconds)
hist.p50();  // Median latency
hist.p95();  // 95th percentile
hist.p99();  // 99th percentile
hist.count;  // Total samples recorded

// Custom percentile
hist.percentileMs(90); // p90

// Reset for next window
hist.reset();
```

The histogram uses 16 log2-scale buckets covering 1us to 32ms+, providing fast O(1) recording with approximate percentile queries.

## Tick Loop Integration

Track strategy tick latency to detect performance degradation:

```typescript
const tickLatency = LatencyHistogram.create();

// In your tick loop or strategy events:
strategy.onSdk("tick_complete", (event) => {
  tickLatency.recordMs(event.durationMs);

  // Alert if p95 exceeds threshold
  if (tickLatency.p95() > 50) {
    logger.warn("Tick latency p95 exceeded 50ms", {
      p50: tickLatency.p50(),
      p95: tickLatency.p95(),
      p99: tickLatency.p99(),
      samples: tickLatency.count,
    });
  }
});
```

## Logger Wrapper

The SDK provides a Pino-based structured logger via `lib/logger/`:

```typescript
import { createLogger } from "@polybot/sdk";

const logger = createLogger({ level: "info" });
logger.info("Strategy started", { conditionId, detector: "SimpleArb" });
logger.warn("High latency detected", { p95: tickLatency.p95() });
logger.error("Order failed", { error: tradingError.toJSON() });
```

All log output is structured JSON — suitable for log aggregation services (Datadog, Grafana Loki, etc.).
