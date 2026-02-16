# Examples

Runnable examples demonstrating SDK usage patterns.

## Available Examples

| Example | Description | Doc Page |
|---------|-------------|----------|
| `simple-arb.ts` | Oracle vs orderbook arbitrage | [Simple Arbitrage](/examples/simple-arb) |
| `ev-hunter.ts` | Expected value hunting with Kelly sizing | [EV Hunter](/examples/ev-hunter) |
| `conservative-mm.ts` | Market making with conservative preset | [Conservative MM](/examples/conservative-mm) |
| `scanner-strategy.ts` | Multi-market scanning and rotation | [Scanner Strategy](/examples/scanner-strategy) |

## Running Examples

```bash
# Type-check examples
npx tsx examples/simple-arb.ts
npx tsx examples/conservative-mm.ts
```

All examples use `PaperExecutor` by default — no API keys or real funds needed.

## Writing Your Own

Start from any example above and customize:

1. Implement `SignalDetector` — the only required interface
2. Add risk guards via `GuardPipeline` (or use a preset)
3. Add exit policies via `ExitPipeline`
4. Build with `StrategyBuilder.create().withDetector(...).build()`
