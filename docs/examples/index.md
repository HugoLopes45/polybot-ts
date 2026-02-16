# Examples

Annotated examples demonstrating SDK usage.

## Available Examples

See the `examples/` directory in the repository:

- `simple-arb.ts` — Simple arbitrage detector
- `ev-hunter.ts` — Expected value hunting strategy
- `conservative-mm.ts` — Market making with conservative guards
- `scanner.ts` — Multi-market scanning

## Running Examples

```bash
# Paper trading (no API keys needed)
pnpm examples:paper

# Live trading (requires API keys)
pnpm examples:live
```

## Structure

Each example includes:
- Line-by-line annotations
- How to run
- Expected output
- Variations
