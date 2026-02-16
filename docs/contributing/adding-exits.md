# Adding an Exit Policy

Learn how to add a custom exit policy for automatic position management.

## What is an Exit Policy?

Exit policies determine when to close a position. Each implements `ExitPolicy` and returns `ExitReason | null`.

## Step 1: Write the Test First

```typescript
import { describe, expect, it } from "vitest";
import { MyExit } from "./my-exit.js";

describe("MyExit", () => {
  it("triggers when threshold exceeded", () => {
    const exit = new MyExit(Decimal.from("0.10"));
    const position = buildMockPosition({ pnlPercent: Decimal.from("0.15") });
    const reason = exit.check(position);
    expect(reason).not.toBeNull();
  });

  it("does not trigger below threshold", () => {
    const exit = new MyExit(Decimal.from("0.10"));
    const position = buildMockPosition({ pnlPercent: Decimal.from("0.05") });
    const reason = exit.check(position);
    expect(reason).toBeNull();
  });
});
```

## Step 2: Implement the Exit

```typescript
import { ExitPolicy, ExitReason, Position } from "@polybot/sdk";

export class MyExit implements ExitPolicy {
  readonly name = "MyExit" as const;
  readonly urgency: "Low" | "Medium" | "High" | "Emergency";

  constructor(
    private threshold: Decimal,
    urgency: "Low" | "Medium" | "High" | "Emergency" = "Medium"
  ) {
    this.urgency = urgency;
  }

  check(position: Position): ExitReason | null {
    const pnlPercent = position.pnlPercent();

    if (pnlPercent.gt(this.threshold)) {
      return {
        policyName: this.name,
        urgency: this.urgency,
        reason: `PNL ${pnlPercent} exceeds ${this.threshold}`,
      };
    }

    return null;
  }
}
```

## Step 3: Export from Module

Add to `src/signal/index.ts`:

```typescript
export { MyExit } from "./exits/my-exit.js";
```

## Testing Tips

- Test edge cases at threshold boundary
- Verify urgency levels work correctly
- Include reason messages for debugging
