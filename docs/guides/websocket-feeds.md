# WebSocket Feeds

Real-time orderbook and trade streaming via Polymarket WebSocket channels.

## WsManager Setup

`WsManager` wraps a WebSocket client and manages subscriptions, message buffering, heartbeat detection, and reconnection:

```typescript
import { WsManager, ReconnectionPolicy } from "@polybot/sdk";

const manager = new WsManager(wsClient, {
	heartbeatTimeoutMs: 30_000,
	maxBufferSize: 1000,
	reconnectionPolicy: new ReconnectionPolicy({
		baseDelayMs: 1000,
		maxDelayMs: 30_000,
		maxAttempts: 10,
		jitterFactor: 0.2,
	}),
});
```

The `wsClient` must implement `WsClientLike`:

```typescript
interface WsClientLike {
	connect(): Promise<void>;
	send(data: string): Result<void, TradingError>;
	close(): void;
	getState(): WsState;
	onMessage(handler: (data: string) => void): void;
	onClose(handler: (code: number, reason: string) => void): void;
	onError(handler: (error: Error) => void): void;
}
```

## Subscribing to Channels

```typescript
manager.subscribe({
	channel: "orderbook",
	assets: ["0xabc123"],
	handler: (message) => {
		// Handle orderbook update — BookUpdate type
	},
});

manager.subscribe({
	channel: "trades",
	assets: ["0xabc123", "0xdef456"],
	handler: (message) => {
		// Handle trade message
	},
});

await manager.connect();
```

## Unsubscribing

Subscription keys are composite: `channel:assets.join(",")`.

```typescript
manager.unsubscribe("trades:0xabc123,0xdef456");
```

## Heartbeat Monitoring

The manager tracks the last message timestamp. Use `checkHeartbeat()` to detect stale connections:

```typescript
const isHealthy = manager.checkHeartbeat();
// Returns false if no message received within heartbeatTimeoutMs
```

## MarketFeed — Orderbook Snapshots

`MarketFeed` maintains a live orderbook snapshot from `BookUpdate` messages:

```typescript
import { MarketFeed } from "@polybot/sdk";

const feed = new MarketFeed(conditionId, manager);
const snapshot = feed.snapshot();
// { bids: Level[], asks: Level[] }
```

## UserFeed — Order & Fill Events

`UserFeed` routes user-specific messages (fills, order status updates):

```typescript
import { UserFeed } from "@polybot/sdk";

const userFeed = new UserFeed(config);
userFeed.onFill((fill) => {
	// Handle fill notification
});
userFeed.onOrderStatus((status) => {
	// Handle order status change
});
```

## Generation Tracking

After reconnection, the manager increments its generation counter. Messages from a previous generation are discarded, preventing stale data from reaching handlers. Subscriptions are automatically replayed after reconnect.
