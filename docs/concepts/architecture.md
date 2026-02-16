# Architecture

## Overview

The Polybot SDK follows Domain-Driven Design (DDD) principles with clear bounded contexts and layered architecture.

## Layer Diagram

```
┌─────────────────────────────────────────────────────┐
│                   Public API (index.ts)              │
├─────────────────────────────────────────────────────┤
│              Strategy Runtime (strategy/)           │
├─────────────────────────────────────────────────────┤
│                 Bounded Contexts                    │
│  risk │ signal │ order │ position │ lifecycle     │
│  market │ auth │ exec │ acct │ events │ analytics │
├─────────────────────────────────────────────────────┤
│                 Shared Kernel (shared/)              │
│  identifiers · decimal · result · errors · time    │
├─────────────────────────────────────────────────────┤
│              Library Wrappers (lib/)                │
│  ethereum · clob · websocket · http · logger       │
├─────────────────────────────────────────────────────┤
│         External Libraries (node_modules)           │
└─────────────────────────────────────────────────────┘
```

## Key Interfaces

### SignalDetector

The **only** interface users implement:

```typescript
interface SignalDetector<TConfig, TSignal> {
  name: string;
  detectEntry(ctx: DetectorContextLike): TSignal | null;
  toOrder(signal: TSignal, ctx: DetectorContextLike): SdkOrderIntent;
}
```

### Executor

Order submission abstraction:

```typescript
interface Executor {
  submit(order: SdkOrderIntent): Promise<Result<OrderResult, TradingError>>;
  cancel(orderId: ClientOrderId): Promise<Result<void, TradingError>>;
}
```

## Data Flow

```
WebSocket Update
    │
    ├─ Watchdog.touch()
    ├─ EXIT: ExitPipeline.evaluate()
    ├─ GUARD: GuardPipeline.evaluate()
    ├─ DETECT: detector.detectEntry(ctx)
    ├─ EXECUTE: executor.submit()
    └─ BOOKKEEP: positions.open() → journal.append()
```

## Bounded Contexts

- **risk/** — 19 entry guards, GuardPipeline, presets
- **signal/** — SignalDetector interface, exit policies
- **order/** — Order FSM, OrderCoordinator
- **position/** — PositionManager, reconciliation
- **execution/** — ClobExecutor, PaperExecutor
- **market/** — MarketCatalog, orderbook, arbitrage
- **websocket/** — WsManager, feeds
- **analytics/** — 25+ technical indicators
- **persistence/** — Journals, CTF operations

## Design Principles

1. **Immutability** — All state mutations return new objects
2. **Result<T, E>** — No thrown exceptions in domain code
3. **Branded types** — Zero-cost type safety for identifiers
4. **Library abstraction** — External deps wrapped in `lib/`

## What's Next?

- [Signal Detector](/concepts/signal-detector) — Implement your strategy
- [Result Pattern](/concepts/result-pattern) — Error handling
