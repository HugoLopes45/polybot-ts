# WebSocket Feeds

Real-time orderbook and trade streaming.

## Basic Usage

```typescript
import { WsManager } from "@polybot/sdk";

const client = {
  connect: async () => { /* connect to WS */ },
  send: (data) => { /* send message */ },
  close: () => { /* close connection */ },
  getState: () => { /* return WsState */ },
  onMessage: (handler) => { /* register message handler */ },
  onClose: (handler) => { /* register close handler */ },
  onError: (handler) => { /* register error handler */ },
};

const manager = new WsManager(client, {
  heartbeatTimeoutMs: 30_000,
  maxBufferSize: 1000,
});

manager.subscribe({
  channel: "orderbook",
  assets: ["0xabc123"],
  handler: (message) => {
    // Handle orderbook update
  },
});

await manager.connect();
```

## Subscription Management

```typescript
// Subscribe to a channel
manager.subscribe({
  channel: "trades",
  assets: ["0xabc123", "0xdef456"],
  handler: (message) => {
    // Handle trade message
  },
});

// Unsubscribe
manager.unsubscribe("trades:0xabc123,0xdef456");

// Check heartbeat status
const isHealthy = manager.checkHeartbeat();
```

## Reconnection

```typescript
import { ExponentialBackoffPolicy } from "@polybot/sdk";

const reconnectionPolicy = new ExponentialBackoffPolicy({
  initialDelayMs: 1000,
  maxDelayMs: 30_000,
  maxAttempts: 10,
});

const manager = new WsManager(client, {
  reconnectionPolicy,
});
```
