# Position Tracking

Immutable position management with FIFO cost basis, high-water mark tracking, and drift reconciliation.

## Position Lifecycle

```
Open → (optional Reduce) → Close
  │                          │
  └── returns new Manager ───┘
```

All mutations return **new** `PositionManager` instances — the original is never modified.

## Basic Usage

```typescript
import {
  PositionManager, Decimal, MarketSide,
  conditionId, marketTokenId, unwrap
} from "@polybot/sdk";

let manager = PositionManager.create();

// Open a position (returns Result — never throws)
const result = manager.open(
  conditionId("0x123"),
  marketTokenId("yes-token"),
  MarketSide.Yes,
  Decimal.from("0.50"),  // entry price
  Decimal.from("100"),   // size (number of tokens)
  Date.now(),
);
manager = unwrap(result); // unwrap or handle error

manager.openCount();     // 1
manager.totalNotional(); // 50.00 (price × size)
```

## Closing a Position

```typescript
const closed = manager.close(
  conditionId("0x123"),
  Decimal.from("0.60"), // exit price
  Date.now(),
);

if (closed) {
  manager = closed.manager; // Must reassign — immutable!
  closed.pnl;               // Decimal: 10.00 profit
}
```

::: warning Important
Always reassign `manager` after `open()`, `close()`, and `reduce()`. The original instance is unchanged.
:::

## Partial Closes

Reduce position size without fully closing:

```typescript
const reduced = manager.reduce(
  conditionId("0x123"),
  Decimal.from("30"),   // reduce by 30 tokens
  Decimal.from("0.58"), // exit price for the reduction
);

if (reduced) {
  manager = reduced.manager;
  reduced.pnl; // P&L for the 30 tokens sold
}
```

## FIFO Cost Basis

The `CostBasis` class tracks individual fills with weighted average pricing:

```typescript
import { CostBasis, Decimal } from "@polybot/sdk";

let basis = CostBasis.create();

basis = basis.addFill({ price: Decimal.from("0.45"), size: Decimal.from("50"), timestampMs: Date.now() });
basis = basis.addFill({ price: Decimal.from("0.48"), size: Decimal.from("50"), timestampMs: Date.now() });

basis.totalCost();       // 46.50 (0.45×50 + 0.48×50)
basis.totalSize();       // 100
basis.weightedAvgPrice(); // 0.465
basis.fillCount();       // 2
```

## High-Water Mark and Drawdown

Each `SdkPosition` tracks its peak unrealized value:

```typescript
const pos = manager.get(conditionId("0x123"));
if (pos) {
  pos.highWaterMark;   // Peak mark-to-market value
  pos.entryPrice;      // Entry price
  pos.size;            // Current size
  pos.costBasis;       // CostBasis instance
  pos.notional();      // entryPrice × size
}
```

## Position Reconciliation

Detect drift between local state and exchange:

```typescript
import { PositionReconciler } from "@polybot/sdk";

const reconciler = new PositionReconciler({
  haltThreshold: 3,    // Halt if >3 discrepancies
  toleranceBps: 10,    // Ignore size diffs < 10bps
});

const result = reconciler.reconcile(
  manager.allOpen(),   // SDK positions
  exchangePositions,   // From exchange API
);

result.shouldHalt; // true if too many discrepancies
result.summary;    // "Sync: 0 orphans, 1 unknowns, 0 mismatches"

for (const action of result.actions) {
  switch (action.type) {
    case "orphan":        // SDK has position, exchange doesn't
    case "unknown":       // Exchange has position, SDK doesn't
    case "size_mismatch": // Both have it, sizes differ
  }
}
```

## Querying Positions

```typescript
manager.openCount();          // Number of open positions
manager.closedCount();        // Number of retained closed positions
manager.totalNotional();      // Sum of all open notional values
manager.totalRealizedPnl();   // Cumulative realized P&L
manager.hasPosition(cid);     // Check if position exists
manager.allOpen();            // All open SdkPosition[]
manager.recentClosed(10);     // Last 10 closed (newest first)
```
