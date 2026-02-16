# Risk Management

19 built-in risk guards protect your capital.

## Basic Setup

All guards use private constructors with static factory methods:

```typescript
import {
  GuardPipeline,
  MaxSpreadGuard,
  MaxPositionsGuard,
  KillSwitchGuard,
  Decimal
} from "@polybot/sdk";

const guards = GuardPipeline.create()
  .with(MaxSpreadGuard.normal())
  .with(MaxPositionsGuard.create(5))
  .with(KillSwitchGuard.create(Decimal.from(3), Decimal.from(5)));
```

## Available Guards

| Guard | Purpose | Factory Methods |
|-------|---------|----------------|
| `MaxSpreadGuard` | Block if spread too wide | `.tight()`, `.normal()`, `.wide()`, `.fromPct(n)` |
| `MaxPositionsGuard` | Limit concurrent positions | `.create(n)` |
| `BalanceGuard` | Check sufficient balance | `.create(minBalance)` |
| `CooldownGuard` | Wait between trades | `.short()`, `.normal()`, `.long()`, `.fromSecs(n)` |
| `ExposureGuard` | Limit total exposure | `.conservative()`, `.moderate()`, `.aggressive()` |
| `KillSwitchGuard` | Auto-halt on losses | `.create(softPct, hardPct)` |
| `BookStalenessGuard` | Check orderbook freshness | `.fromSecs(n)` |

## Presets

```typescript
const conservative = GuardPipeline.conservative();
const aggressive = GuardPipeline.aggressive();
const minimal = GuardPipeline.minimal();
const standard = GuardPipeline.standard();
```

## Custom Guards

```typescript
import { BalanceGuard, Decimal } from "@polybot/sdk";

const guards = GuardPipeline.create()
  .with(MaxSpreadGuard.tight())       // 3% max spread
  .with(BalanceGuard.create(Decimal.from("100")))  // min $100
  .with(MaxPositionsGuard.create(3)); // max 3 positions
```

## How It Works

```
Order Request
    ↓
GuardPipeline.evaluate()
    ↓
┌─────────────────────────────────────┐
│ Guard 1: MaxSpreadGuard → Allow    │
│ Guard 2: BalanceGuard → Allow      │
│ Guard 3: KillSwitchGuard → Block! │
└─────────────────────────────────────┘
    ↓
If Block → Return GuardVerdict with reason
If Allow → Continue to execution
```
