# Position Tracking

Immutable position management with full P&L tracking.

## Basic Usage

```typescript
import { PositionManager, MarketSide } from "@polybot/sdk";

let manager = PositionManager.create();

// Open position
const result = manager.open(
  conditionId("0x123"),
  marketTokenId("yes"),
  MarketSide.Yes,
  Decimal.from("0.50"),  // entry price
  Decimal.from("100"),   // size
  Date.now()
);

manager = unwrap(result);

manager.openCount();     // 1
manager.totalNotional(); // 50.00

// Close position
const closed = manager.close(
  conditionId("0x123"),
  Decimal.from("0.60"),
  Date.now()
);

if (closed) {
  closed.pnl;  // 10.00 profit
}
```

## Key Features

- **Immutable** — All mutations return new instances
- **FIFO Cost Basis** — First-in, first-out fill tracking
- **High-water Mark** — Automatic HWM and drawdown tracking
- **Position Reconciliation** — Detect drift from exchange state
