# Order Management

Order differ, idempotency guard, and order lifecycle tools.

## Order Differ

Compute the minimal action set to transition from live orders to desired orders. Prevents churn by using configurable tolerance:

```typescript
import { diffOrders, Decimal } from "@polybot/sdk";
import type { DesiredOrder, LiveOrder, DiffAction } from "@polybot/sdk";

const desired: DesiredOrder[] = [
  { tokenId: "yes-token", side: "buy", price: Decimal.from("0.45"), size: Decimal.from("100") },
  { tokenId: "no-token", side: "buy", price: Decimal.from("0.50"), size: Decimal.from("50") },
];

const live: LiveOrder[] = [
  { orderId: "abc", tokenId: "yes-token", side: "buy", price: Decimal.from("0.44"), size: Decimal.from("100") },
  { orderId: "def", tokenId: "yes-token", side: "sell", price: Decimal.from("0.60"), size: Decimal.from("80") },
];

const actions = diffOrders(desired, live, {
  priceTolerance: Decimal.from("0.002"), // Don't amend if price diff < 0.2%
  sizeTolerance: Decimal.from("0.05"),   // Don't amend if size diff < 5%
});

for (const action of actions) {
  switch (action.type) {
    case "keep":   // Order is within tolerance — do nothing
    case "amend":  // Update price/size of existing order
    case "place":  // Submit a new order
    case "cancel": // Cancel order no longer desired
  }
}
```

**Matching logic**: Orders are matched by `tokenId + side`. The differ produces the minimum set of keep/amend/place/cancel actions.

## Idempotency Guard

Prevent duplicate order submissions with a time-based dedup cache:

```typescript
import { IdempotencyGuard, SystemClock } from "@polybot/sdk";

const guard = IdempotencyGuard.create(
  { ttlMs: 5000 }, // 5-second dedup window
  SystemClock,
);

// Check before submitting
const isDup = guard.isDuplicate("yes-token", "buy", "0.45", "100");
// false — first time, recorded in cache

const isDup2 = guard.isDuplicate("yes-token", "buy", "0.45", "100");
// true — same signature within TTL window

guard.size;    // Number of active (non-expired) entries
guard.clear(); // Reset all entries
```

**Order signature**: Composed of `tokenId + side + price + size`. Entries auto-expire after the configured TTL.

## Order Lifecycle

Orders follow a 7-state FSM:

```
Created → Submitted → Open → PartiallyFilled → Filled
                        │                         ↑
                        └→ Cancelled ←─────────────┘
                        └→ Expired
```

Use the state machine helpers:

```typescript
import { isActive, isTerminal, canTransitionTo } from "@polybot/sdk";

isActive("Open");           // true — order can still be filled
isTerminal("Filled");       // true — final state
canTransitionTo("Open", "PartiallyFilled"); // true
canTransitionTo("Filled", "Open");          // false — can't go backward
```

## Order Handle Builder

Fluent API for tracking individual orders with callbacks:

```typescript
import { OrderHandleBuilder } from "@polybot/sdk";

const handle = new OrderHandleBuilder()
  .onFill((fill) => {
    // Called on each partial or complete fill
  })
  .onComplete((result) => {
    // Called when order reaches terminal state
  })
  .build();
```

## Order Coordinator

The `OrderCoordinator` manages the full lifecycle — submission, tracking, cancellation:

```typescript
import { OrderCoordinator } from "@polybot/sdk";

// OrderCoordinator is typically created by StrategyBuilder
// and wired to an Executor automatically.
// Direct usage is for advanced scenarios only.
```
