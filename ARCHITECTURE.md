# Architecture — Polybot TypeScript SDK

## Layer Diagram

```
┌─────────────────────────────────────────────────────┐
│                   Public API (index.ts)              │
├─────────────────────────────────────────────────────┤
│              Strategy Runtime (strategy/)             │
│   ┌─────────────┐  ┌──────────┐  ┌───────────────┐  │
│   │BuiltStrategy│  │  Builder │  │    Presets     │  │
│   └─────────────┘  └──────────┘  └───────────────┘  │
├─────────────────────────────────────────────────────┤
│                 Bounded Contexts                     │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────────┐  │
│  │ risk │ │signal│ │order │ │ pos  │ │ lifecycle│  │
│  ├──────┤ ├──────┤ ├──────┤ ├──────┤ ├──────────┤  │
│  │market│ │ auth │ │ exec │ │ acct │ │  events  │  │
│  ├──────┤ ├──────┤ ├──────┤ ├──────┤ ├──────────┤  │
│  │  ws  │ │ ctf  │ │persist│ │contxt│ │          │  │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────────┘  │
├─────────────────────────────────────────────────────┤
│                 Shared Kernel (shared/)               │
│  identifiers · decimal · result · errors · time      │
│  market-side · config                                │
├─────────────────────────────────────────────────────┤
│              Library Wrappers (lib/)                  │
│  ethereum · clob · websocket · http · logger ·       │
│  validation · events                                 │
├─────────────────────────────────────────────────────┤
│         External Libraries (node_modules)             │
│  viem · @polymarket/clob-client · ws · decimal.js    │
│  zod · pino · eventemitter3                          │
└─────────────────────────────────────────────────────┘
```

## Core Interfaces

### SignalDetector<TConfig, TSignal>
The ONLY interface users implement. Two methods:
- `detectEntry(ctx: DetectorContext): TSignal | null`
- `toOrder(signal: TSignal, ctx: DetectorContext): SdkOrderIntent`

### EntryGuard
Pre-trade safety check. Returns `GuardVerdict` (Allow | Block).
Composed via `GuardPipeline` (AND semantics, short-circuit on Block).

### ExitPolicy
Position exit detection. Returns `ExitReason | null`.
Composed via `ExitPipeline` (OR semantics, first exit wins).

### Executor
Order submission abstraction. Two implementations:
- `ClobExecutor` — real Polymarket CLOB
- `PaperExecutor` — simulation for testing

## Data Flow

```
WebSocket Update
  │
  ├─ Watchdog.touch()
  ├─ StateMachine.canOpen()?
  ├─ Build DetectorContext snapshot
  │
  ├─ EXIT: ExitPipeline.evaluate() for each open position
  │    └─ If exit → submit sell → close position → emit events
  │
  ├─ GUARD: GuardPipeline.evaluate()
  │    └─ If block → emit RiskLimitBreached → return
  │
  ├─ DETECT: detector.detectEntry(ctx)
  │    └─ If signal → build order intent
  │
  ├─ EXECUTE: executor.submit() with retry + saga compensation
  │
  └─ BOOKKEEP: positions.open() → journal.append() → events
```

## Error Handling

All domain operations return `Result<T, TradingError>`. Errors are classified:
- **Retryable**: Network, Timeout, RateLimit → exponential backoff
- **NonRetryable**: Auth, OrderRejected, InsufficientBalance → fail immediately
- **Fatal**: Config, System → halt strategy

## Implementation Phases

- [x] Phase 0: Foundation (shared/, lifecycle/, events/) — 115 tests
- [ ] Phase 1: Risk & Signal Framework
- [ ] Phase 2: Execution & Auth
- [ ] Phase 3: WebSocket & Market Data
- [ ] Phase 4: Strategy Runtime
- [ ] Phase 5: Persistence & CTF
- [ ] Phase 6: Polish & Publish
