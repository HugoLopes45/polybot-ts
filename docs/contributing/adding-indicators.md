# Adding an Indicator

Learn how to add a custom technical indicator to the SDK.

## What is an Indicator?

Technical indicators are pure functions that transform price/volume data into derived signals. Every indicator accepts `Decimal[]` or `Candle[]` inputs and returns `Decimal | null`.

## Step 1: Write the Test First

```typescript
import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { calcMyIndicator } from "./my-indicator.js";

describe("calcMyIndicator", () => {
  it("returns null with insufficient data", () => {
    const closes = [Decimal.from("0.50")];
    expect(calcMyIndicator(closes, 14)).toBeNull();
  });

  it("computes correctly with exact data", () => {
    const closes = Array.from({ length: 14 }, (_, i) =>
      Decimal.from((0.45 + i * 0.01).toFixed(2)),
    );
    const result = calcMyIndicator(closes, 14);
    expect(result).not.toBeNull();
    // Assert against a known reference value
    expect(result!.toNumber()).toBeCloseTo(0.515, 3);
  });

  it("uses only the last N values when data exceeds period", () => {
    const closes = Array.from({ length: 20 }, (_, i) =>
      Decimal.from((0.40 + i * 0.005).toFixed(3)),
    );
    const result = calcMyIndicator(closes, 14);
    expect(result).not.toBeNull();
  });
});
```

## Step 2: Implement the Indicator

```typescript
import { Decimal } from "../shared/decimal.js";

export function calcMyIndicator(
  closes: readonly Decimal[],
  period: number,
): Decimal | null {
  if (closes.length < period) return null;

  const slice = closes.slice(-period);
  // Your calculation logic using Decimal arithmetic
  let sum = Decimal.ZERO;
  for (const close of slice) {
    sum = sum.add(close);
  }
  return sum.div(Decimal.from(period));
}
```

**Key rules**:
- Return `null` if there's insufficient data (never throw)
- Use `Decimal` for all arithmetic (no raw `number` math)
- Keep it pure — no side effects, no state mutation
- Accept `readonly` arrays to enforce immutability

## Step 3: Export from Module

Add to `src/analytics/index.ts`:

```typescript
export { calcMyIndicator } from "./my-indicator.js";
```

## Step 4: Add to Reference Table

Update `docs/guides/analytics.md` — add a row to the indicator reference table:

| Category | Indicator | Function | Key Output |
|----------|-----------|----------|------------|
| **Your Category** | My Indicator | `calcMyIndicator(closes, period)` | `Decimal` |

## Testing Tips

- Test with insufficient data (returns null)
- Test with exact period length
- Test with excess data (should use last N values)
- Use table-driven tests (`it.each`) for known reference values
- Compare against reference implementations or known datasets
