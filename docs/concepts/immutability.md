# Immutability

All state mutations return new objects — no mutation in place.

## Why Immutability?

```typescript
// ❌ Mutation - buggy, hard to trace
const position = { size: 100, pnl: 10 };
position.size = 50;  // Where did this happen?

// ✅ Immutable - predictable, traceable
const position = { size: 100, pnl: 10 };
const updated = { ...position, size: 50 };  // New object
```

## PositionManager Example

```typescript
import { PositionManager, unwrap } from "@polybot/sdk";

let manager = PositionManager.create();

// Open position - returns NEW manager
const result = manager.open(
  conditionId("0x123"),
  marketTokenId("yes"),
  MarketSide.Yes,
  Decimal.from("0.50"),
  Decimal.from("100"),
  clock.now()  // Use clock instead of Date.now()
);

// ✅ Safe - original unchanged
manager.openCount();  // 0

manager = unwrap(result);
manager.openCount();   // 1
```

## Readonly Properties

```typescript
interface Position {
  readonly conditionId: ConditionId;
  readonly size: Decimal;
  readonly entryPrice: Decimal;
  readonly pnl: Decimal;
}
```

## Best Practices

1. **Never mutate** — Always use spread or `.with()` methods
2. **Assign to new variable** — `manager = manager.open(...)`
3. **Use readonly** — Mark all state interfaces as readonly
4. **Prefer pure functions** — Same input → same output

## What's Next?

- [Result Pattern](/concepts/result-pattern) — Error handling
