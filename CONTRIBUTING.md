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
