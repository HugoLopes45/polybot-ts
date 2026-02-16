# Adding a Guard

Learn how to add a custom risk guard to the SDK.

## What is a Guard?

Risk guards are pre-trade safety checks that block orders when conditions are unfavorable. Every guard implements `EntryGuard` and returns `GuardVerdict`.

## Step 1: Write the Test First

```typescript
import { describe, expect, it } from "vitest";
import { MyGuard } from "./my-guard.js";

describe("MyGuard", () => {
  it("allows when condition is met", () => {
    const guard = MyGuard.create({ threshold: Decimal.from("0.05") });
    const ctx = buildMockContext({ spread: Decimal.from("0.03") });
    const verdict = guard.check(ctx);
    expect(verdict.allowed).toBe(true);
  });

  it("blocks when condition is violated", () => {
    const guard = MyGuard.create({ threshold: Decimal.from("0.05") });
    const ctx = buildMockContext({ spread: Decimal.from("0.08") });
    const verdict = guard.check(ctx);
    expect(verdict.allowed).toBe(false);
  });
});
```

## Step 2: Implement the Guard

```typescript
import { EntryGuard, GuardVerdict, GuardContext } from "@polybot/sdk";

export class MyGuard implements EntryGuard {
  readonly guardName = "MyGuard" as const;

  constructor(private threshold: Decimal) {}

  static create(params: { threshold: Decimal }) {
    return new MyGuard(params.threshold);
  }

  check(ctx: GuardContext): GuardVerdict {
    const spread = ctx.spread();

    if (spread.gt(this.threshold)) {
      return {
        allowed: false,
        guardName: this.guardName,
        reason: `Spread ${spread} exceeds threshold ${this.threshold}`,
        diagnostic: { spread: spread.toString() },
      };
    }

    return { allowed: true, guardName: this.guardName };
  }
}
```

## Step 3: Export from Module

Add to `src/risk/index.ts`:

```typescript
export { MyGuard } from "./guards/my-guard.js";
```

## Testing Tips

- Test both allow and block cases
- Include diagnostic values for debugging
- Use `buildMockContext` from test utilities
