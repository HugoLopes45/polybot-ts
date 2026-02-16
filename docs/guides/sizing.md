# Position Sizing

Kelly criterion, fixed sizing, and custom sizers.

## Kelly Sizer

```typescript
import { KellySizer, Decimal } from "@polybot/sdk";

const fullKelly = KellySizer.full();
const halfKelly = KellySizer.half();
const quarterKelly = KellySizer.quarter();

const customResult = KellySizer.create(0.3);
if (customResult.ok) {
  const sizer = customResult.value;
}

const result = fullKelly.size({
  balance: Decimal.from("1000"),
  edge: Decimal.from("0.10"),        // 10% edge
  marketPrice: Decimal.from("0.50"),
  maxPositionPct: Decimal.from("0.25"), // Optional, default 25%
});

// result.size: recommended position size in tokens
// result.fraction: fraction of balance to risk
// result.method: "kelly" | "half_kelly" | "quarter_kelly"
```

## Fixed Sizer

```typescript
import { FixedSizer, Decimal } from "@polybot/sdk";

const sizerResult = FixedSizer.create(10); // 10% of balance
if (sizerResult.ok) {
  const sizer = sizerResult.value;

  const result = sizer.size({
    balance: Decimal.from("1000"),
    edge: Decimal.from("0.10"),
    marketPrice: Decimal.from("0.50"),
  });

  // result.size: position size in tokens
  // result.fraction: 0.10 (10%)
  // result.method: "fixed"
}
```

## Sizing Input

```typescript
interface SizingInput {
  balance: Decimal;       // Current balance
  edge: Decimal;          // (fairPrice - marketPrice) / marketPrice
  marketPrice: Decimal;   // Current market price
  maxPositionPct?: Decimal; // Max % of balance per position (default 0.25)
}
```
