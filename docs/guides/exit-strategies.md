# Exit Strategies

10 built-in exit policies for automatic position management.

## Basic Setup

All exit policies use private constructors with static factory methods:

```typescript
import {
  ExitPipeline,
  TakeProfitExit,
  StopLossExit,
  TrailingStopExit
} from "@polybot/sdk";

const exits = ExitPipeline.create()
  .with(TakeProfitExit.fromPct(15))   // 15% ROI target
  .with(StopLossExit.fromPct(8))      // 8% max loss
  .with(TrailingStopExit.fromPct(5)); // 5% trailing stop
```

## Available Exits

| Exit | Trigger | Factory Methods |
|------|---------|----------------|
| `TakeProfitExit` | ROI exceeds threshold | `.small()`, `.normal()`, `.large()`, `.fromPct(n)` |
| `StopLossExit` | Loss exceeds threshold | `.tight()`, `.normal()`, `.wide()`, `.fromPct(n)` |
| `TrailingStopExit` | Price drops from HWM | `.tight()`, `.normal()`, `.wide()`, `.fromPct(n)` |
| `TimeExit` | Hold time exceeded | `.fromSecs(n)` |
| `MaxHoldTimeExit` | Max hold time reached | `.create(maxHoldSecs)` |
| `GammaRiskExit` | Gamma risk too high | `.create(maxGamma)` |
| `ProfitLockerExit` | Lock in partial profits | `.create(roiThreshold, lockPct)` |

## Preset Configurations

```typescript
// Small take-profit: 5% ROI
const quick = TakeProfitExit.small();

// Normal take-profit: 10% ROI
const standard = TakeProfitExit.normal();

// Large take-profit: 20% ROI
const patient = TakeProfitExit.large();

// Tight stop-loss: 3% max loss
const tight = StopLossExit.tight();

// Normal stop-loss: 5% max loss
const balanced = StopLossExit.normal();

// Wide stop-loss: 10% max loss
const loose = StopLossExit.wide();
```

## How It Works

```
Tick Loop
    ↓
ExitPipeline.evaluate(position)
    ↓
┌─────────────────────────────────────┐
│ Exit 1: TakeProfit → null          │
│ Exit 2: StopLoss → ExitReason!     │
└─────────────────────────────────────┘
    ↓
If ExitReason → Submit close order
```
