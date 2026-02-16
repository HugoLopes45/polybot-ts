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

## Adding Guards and Exits

Wire risk management and exit policies into the strategy:

```typescript
import {
	StrategyBuilder, PaperExecutor, GuardPipeline, ExitPipeline,
	MaxSpreadGuard, KillSwitchGuard, TakeProfitExit, StopLossExit,
	Decimal, MemoryJournal,
} from "@polybot/sdk";

const guards = GuardPipeline.create()
	.with(MaxSpreadGuard.normal())
	.with(KillSwitchGuard.create(3, 5));

const exits = ExitPipeline.create()
	.with(new TakeProfitExit(Decimal.from("0.15")))
	.with(new StopLossExit(Decimal.from("-0.08")));

const strategy = StrategyBuilder.create()
	.withDetector(myDetector)
	.withGuards(guards)
	.withExits(exits)
	.withExecutor(new PaperExecutor({ fillProbability: 1 }))
	.withJournal(new MemoryJournal())
	.build();
```

## Running the Tick Loop

The strategy runs via `tick()` — each call evaluates exits, guards, and the detector:

```typescript
import { TestContextBuilder, Decimal, MarketSide } from "@polybot/sdk";

// Build a test context simulating market conditions
const ctx = new TestContextBuilder()
	.withBestBid(MarketSide.Yes, Decimal.from("0.45"))
	.withBestAsk(MarketSide.Yes, Decimal.from("0.50"))
	.withOraclePrice(Decimal.from("0.55"))
	.build();

// Execute a tick — evaluates exit → guard → detect → execute → bookkeep
await strategy.tick(ctx);
```

The tick loop order:
1. **Exit pipeline** — check open positions for exit conditions
2. **Guard pipeline** — validate that entry conditions are safe
3. **Detector** — check for entry signals
4. **Execute** — submit order via executor
5. **Bookkeep** — update positions, journal, stats

## Error Handling

All user-supplied code (detector, guards, exits) is wrapped in try/catch. If your detector throws, the strategy logs the error and continues — it won't crash the tick loop.

```typescript
// Errors are emitted as SDK events
strategy.events.onSdk("error_occurred", (event) => {
	console.error("Strategy error:", event.error);
});
```

## Presets

Presets return pre-configured builders with guards and exits:

| Preset | Description |
|--------|-------------|
| `conservative()` | Tight guards, small positions, low risk |
| `aggressive()` | Relaxed guards, larger positions |
| `scalper()` | Tight spreads, fast ticks, tight stops |
| `evHunter()` | Expected value hunting, moderate guards |

```typescript
import { conservative } from "@polybot/sdk";

const strategy = conservative()
	.withDetector(myDetector)
	.withExecutor(executor)
	.build();
```

## build() vs buildProduction()

```typescript
// Development — allows missing components, uses defaults
const dev = StrategyBuilder.create()
	.withDetector(detector)
	.build();

// Production — validates all required components, returns Result
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
