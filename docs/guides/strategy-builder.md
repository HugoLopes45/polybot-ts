# Strategy Builder

Assemble strategies from components using the fluent builder pattern.

## Basic Usage

```typescript
import { StrategyBuilder, PaperExecutor } from "@polybot/sdk";

const strategy = StrategyBuilder.create()
  .withDetector(myDetector)
  .withExecutor(new PaperExecutor())
  .build();
```

## Presets

Presets are standalone functions that return pre-configured builders:

| Preset | Description |
|--------|-------------|
| `conservative()` | Tight guards, small positions, low risk |
| `aggressive()` | Relaxed guards, large positions, high risk |
| `scalper()` | Tight spreads, fast ticks, tight stops |
| `longTerm()` | Wider stops, time-based exits |
| `evHunter()` | Expected value hunting, moderate guards |

```typescript
import { conservative } from "@polybot/sdk";

const strategy = conservative()
  .withDetector(myDetector)
  .withExecutor(executor)
  .build();
```

## Custom Configuration

```typescript
const custom = StrategyBuilder.create()
  .withDetector(myDetector)
  .withGuards(guards)
  .withExits(exits)
  .withExecutor(executor)
  .withJournal(journal)
  .build();
```

## build() vs buildProduction()

```typescript
// Development - allows missing components, uses defaults
const dev = StrategyBuilder.create()
  .withDetector(detector)
  .build();

// Production - validates all required components
const prodResult = StrategyBuilder.create()
  .withDetector(detector)
  .withGuards(guards)
  .withExits(exits)
  .withExecutor(executor)
  .withFeeModel(feeModel)
  .buildProduction();

if (prodResult.ok) {
  const strategy = prodResult.value;
}
```
