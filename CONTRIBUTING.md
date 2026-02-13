# Contributing to @polybot/sdk

Thank you for your interest in contributing! This guide will help you get started.

## Prerequisites

- Node.js >= 20
- pnpm (package manager)

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork:
   ```bash
   git clone https://github.com/<your-username>/polybot-ts.git
   cd polybot-ts
   ```
3. Install dependencies:
   ```bash
   pnpm install
   ```
4. Create a feature branch:
   ```bash
   git checkout -b feat/my-feature
   ```

## Development

Run tests in watch mode during development:

```bash
pnpm test:watch
```

Lint and type-check your changes:

```bash
pnpm lint
pnpm typecheck
```

## Test-Driven Development (TDD)

TDD is mandatory for all code changes. Follow the Red-Green-Refactor cycle:

1. **Red** -- Write a failing test that defines expected behavior
2. **Green** -- Write the minimal code to make it pass
3. **Refactor** -- Improve the code while keeping tests green

Bug fixes must include a reproducer test before the fix is applied.

## Code Standards

- **No `any`** -- Use `unknown` with type narrowing when the type is not known
- **`Decimal` for financial math** -- Never use raw `number` for money, prices, or sizes
- **`Result<T, E>` for domain operations** -- No bare `throw` in domain code
- **Branded types for identifiers** -- Use `ConditionId`, `MarketTokenId`, `ClientOrderId`, `ExchangeOrderId`
- **Immutable data** -- All type properties should be `readonly`; return new objects from mutations
- **Files < 800 LOC** -- If a file approaches this limit, propose a split
- **Functions < 50 LOC** -- Keep functions focused and composable
- **Clock injection** -- Never use `Date.now()` directly; inject `Clock` for testability

---

## How to Add a Guard

Risk guards are pre-trade safety checks that block orders when conditions are unfavorable. Every guard implements `EntryGuard` and returns `allow()` or `block()`.

**Canonical example:** `src/risk/guards/max-spread.ts`

### Step 1: Write the test first

Create `src/risk/guards/my-guard.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { MyGuard } from "./my-guard.js";
// Import a test context builder or create a minimal GuardContext stub

describe("MyGuard", () => {
  it("allows when condition is met", () => {
    const guard = MyGuard.create(/* params */);
    const ctx = /* build a GuardContext stub */;
    const verdict = guard.check(ctx);
    expect(verdict.allowed).toBe(true);
  });

  it("blocks with diagnostic values when condition is violated", () => {
    const guard = MyGuard.create(/* params */);
    const ctx = /* build a GuardContext stub with violating values */;
    const verdict = guard.check(ctx);
    expect(verdict.allowed).toBe(false);
    expect(verdict.guardName).toBe("MyGuard");
  });
});
```

### Step 2: Implement the guard

Create `src/risk/guards/my-guard.ts`:

```typescript
import type { EntryGuard, GuardContext, GuardVerdict } from "../types.js";
import { allow, blockWithValues } from "../types.js";

export class MyGuard implements EntryGuard {
  readonly name = "MyGuard";
  private readonly threshold: number;

  private constructor(threshold: number) {
    this.threshold = threshold;
  }

  static create(threshold: number): MyGuard {
    return new MyGuard(threshold);
  }

  // Named factory presets for common configurations
  static tight(): MyGuard {
    return new MyGuard(/* tight value */);
  }

  static normal(): MyGuard {
    return new MyGuard(/* normal value */);
  }

  check(ctx: GuardContext): GuardVerdict {
    const actual = /* read from ctx */;
    if (actual > this.threshold) {
      return blockWithValues(this.name, "reason message", actual, this.threshold);
    }
    return allow();
  }
}
```

### Step 3: Export from barrels

1. Add to `src/risk/guards/index.ts` (if it exists) or `src/risk/index.ts`
2. Add to `src/index.ts` (public API barrel)

### Key rules

- Constructor is **private** — use static factories (`create()`, named presets)
- `check()` receives a `GuardContext` — read market data, positions, risk metrics from it
- Return `blockWithValues()` with diagnostic info (actual vs threshold) for observability
- Guard name must be unique across all guards (used in pipeline diagnostics)

---

## How to Add an Exit Policy

Exit policies detect when an open position should be closed. Every policy implements `ExitPolicy` and returns an `ExitReason` or `null`.

**Canonical example:** `src/signal/exits/stop-loss.ts`

### Step 1: Write the test first

Create `src/signal/exits/my-exit.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { Decimal } from "../../shared/decimal.js";
import { MyExit } from "./my-exit.js";

describe("MyExit", () => {
  it("returns null when exit condition is not met", () => {
    const exit = MyExit.create(/* params */);
    const position = /* build a PositionLike stub */;
    const ctx = /* build a DetectorContextLike stub */;
    expect(exit.shouldExit(position, ctx)).toBeNull();
  });

  it("returns ExitReason when condition is triggered", () => {
    const exit = MyExit.create(/* params */);
    const position = /* stub with triggering values */;
    const ctx = /* stub */;
    const reason = exit.shouldExit(position, ctx);
    expect(reason).not.toBeNull();
    expect(reason?.type).toBe("my_exit");
  });
});
```

### Step 2: Implement the policy

Create `src/signal/exits/my-exit.ts`:

```typescript
import type { DetectorContextLike, ExitPolicy, ExitReason, PositionLike } from "../types.js";

export class MyExit implements ExitPolicy {
  readonly name = "MyExit";
  private readonly threshold: Decimal;

  private constructor(threshold: Decimal) {
    this.threshold = threshold;
  }

  static create(threshold: Decimal): MyExit {
    return new MyExit(threshold);
  }

  shouldExit(position: PositionLike, ctx: DetectorContextLike): ExitReason | null {
    // Read current market data from ctx
    // Compare against position entry and threshold
    // Return { type: "my_exit", ...diagnostics } or null
  }
}
```

### Step 3: Export from barrels

1. Add to `src/signal/exits/index.ts` (if it exists) or `src/signal/index.ts`
2. Add to `src/index.ts`

### Key rules

- `shouldExit()` receives a `PositionLike` (entry price, size, side, drawdown) and `DetectorContextLike`
- Return `null` when the position should stay open
- Return `{ type: "my_exit_type", ...diagnostics }` when it should close
- The ExitPipeline uses OR semantics — first exit wins

---

## How to Write a Strategy

A strategy is a `SignalDetector` — the only interface users implement. It has two methods:
`detectEntry()` (find a trading opportunity) and `toOrder()` (convert signal to order intent).

**Canonical example:** `examples/simple-arb.ts`

### Step 1: Define your signal type

```typescript
interface MySignal {
  edge: number;
  side: "yes" | "no";
}
```

### Step 2: Implement SignalDetector

```typescript
import type { DetectorContextLike, SdkOrderIntent, SignalDetector } from "@polybot/sdk";
import { Decimal, marketTokenId } from "@polybot/sdk";

const myDetector: SignalDetector<unknown, MySignal> = {
  name: "my-strategy",

  detectEntry(ctx: DetectorContextLike): MySignal | null {
    const oracle = ctx.oraclePrice();
    const ask = ctx.bestAsk("yes");
    if (!oracle || !ask) return null;

    const edge = oracle.sub(ask).toNumber();
    if (edge < 0.03) return null;

    return { edge, side: "yes" };
  },

  toOrder(signal: MySignal, ctx: DetectorContextLike): SdkOrderIntent {
    return {
      conditionId: ctx.conditionId,
      tokenId: marketTokenId("yes-token"),
      side: signal.side,
      direction: "buy",
      price: ctx.bestAsk(signal.side) ?? Decimal.from("0.50"),
      size: Decimal.from("10"),
    };
  },
};
```

### Step 3: Wire into StrategyBuilder

```typescript
import { StrategyBuilder, PaperExecutor } from "@polybot/sdk";

const executor = new PaperExecutor({ fillProbability: 1 });
const strategy = StrategyBuilder.create()
  .withDetector(myDetector)
  .withExecutor(executor)
  .build();
```

Or use a preset for built-in risk management:

```typescript
import { conservative } from "@polybot/sdk";

const strategy = conservative()
  .withDetector(myDetector)
  .withExecutor(executor)
  .build();
```

---

## Architecture Quick Reference

### Module dependency direction

```
Public API (index.ts)
  ↓
Strategy Runtime (strategy/)
  ↓
Bounded Contexts (risk/, signal/, order/, position/, execution/, ...)
  ↓
Shared Kernel (shared/)
  ↓
Library Wrappers (lib/)
  ↓
External Libraries (node_modules)
```

Dependencies point **downward only**. Domain code never imports from `node_modules` directly.

### Where to put new code

| Adding a... | Location | Key interface |
|-------------|----------|---------------|
| Risk guard | `src/risk/guards/` | `EntryGuard` |
| Exit policy | `src/signal/exits/` | `ExitPolicy` |
| Strategy | `examples/` or user code | `SignalDetector` |
| Library wrapper | `src/lib/<name>/` | domain-agnostic interface |
| Shared type | `src/shared/` | branded types, `Result`, `Decimal` |

### Key rules

- **Result, not throw** — domain operations return `Result<T, E>`
- **Decimal, not number** — financial math uses the `Decimal` wrapper
- **Branded IDs** — use `ConditionId`, `MarketTokenId`, etc. (not raw strings)
- **Clock injection** — inject `Clock` for time-dependent code, `FakeClock` in tests
- **Immutability** — all mutations return new objects

## Commit Format

```
<type>: <description>
```

Where `type` is one of: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`

Examples:

```
feat: add trailing stop exit policy
fix: correct BPS calculation in fee model
test: add guard pipeline short-circuit tests
```

## Before Submitting

Run the full CI suite locally:

```bash
pnpm ci
```

This runs lint, type-check, and all tests. All checks must pass before submitting a pull request.

## Pull Requests

- Keep PRs focused on a single concern
- Include a clear description of what changed and why
- Reference any related issues
- Ensure all CI checks pass

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for a detailed overview of the codebase, bounded contexts, and design decisions.
