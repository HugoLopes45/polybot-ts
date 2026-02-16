# Contributing

Contributions are welcome!

## Getting Started

1. Fork the repo
2. Create a feature branch
3. Write tests first (TDD)
4. Follow conventions
5. Submit a PR

## Development

```bash
pnpm install          # Install dependencies
pnpm test             # Run tests
pnpm lint             # Lint code
pnpm typecheck        # Type check
pnpm build            # Build
```

## Guidelines

- **TDD** — All PRs must include tests
- **Biome** — Follow lint rules
- **Immutability** — Never mutate state
- **Result<T, E>** — No thrown exceptions in domain code
- **< 800 LOC** — Split large files

## Tutorials

See CONTRIBUTING.md in the repo for tutorials on:
- Adding guards
- Adding exit policies
- Adding strategies

## What's Next?

- [Architecture](/concepts/architecture) — Design overview
- [Signal Detector](/concepts/signal-detector) — Implement strategies
