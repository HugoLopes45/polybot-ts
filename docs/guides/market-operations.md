# Market Operations

Market scanning, portfolio rebalancing, and arbitrage execution.

## Market Scanner

Score and rank markets across multiple dimensions with configurable weights:

```typescript
import { MarketScanner, Decimal } from "@polybot/sdk";

const scanner = MarketScanner.create({
  weights: {
    volume: Decimal.from("0.3"),
    depth: Decimal.from("0.3"),
    spread: Decimal.from("0.25"),
    freshness: Decimal.from("0.15"),
  },
  rotationThreshold: Decimal.from("0.1"),
  maxSpreadBps: Decimal.from("200"),
});

const scores = scanner.scan([
  { marketId: "m1", volume24h: Decimal.from("50000"), bookDepth: Decimal.from("10000"), spreadBps: Decimal.from("50"), lastUpdateMs: Date.now() },
  { marketId: "m2", volume24h: Decimal.from("20000"), bookDepth: Decimal.from("5000"), spreadBps: Decimal.from("100"), lastUpdateMs: Date.now() - 60_000 },
], Date.now());

// scores sorted by totalScore (highest first)
scores[0].marketId;          // Best market
scores[0].totalScore;        // Composite score
scores[0].components.volume; // Individual dimension scores
```

### Market Rotation

Select top markets with hysteresis to prevent excessive rotation:

```typescript
const topMarkets = scanner.selectTop(scores, 3, ["m1", "m3"]);
// Only replaces current markets if new candidate beats worst current by rotationThreshold
```

## Rebalancer

Maintain a target USDC ratio across token positions:

```typescript
import { Rebalancer, Decimal, unwrap } from "@polybot/sdk";
import type { TokenBalance } from "@polybot/sdk";

const rebalancer = unwrap(Rebalancer.create({
  targetUsdcRatio: Decimal.from("0.3"),    // 30% in USDC
  tolerance: Decimal.from("0.05"),          // 5% tolerance band
  minRebalanceUsdc: Decimal.from("10"),     // Ignore < $10 imbalances
}));

const balances: TokenBalance[] = [
  { tokenId: marketTokenId("yes-1"), balance: Decimal.from("200"), usdcValue: Decimal.from("100") },
  { tokenId: marketTokenId("no-1"), balance: Decimal.from("100"), usdcValue: Decimal.from("40") },
];

const actions = unwrap(rebalancer.calculateRebalance(balances, Decimal.from("50")));
// actions: [{ tokenId, action: "buy"|"sell", amount, currentRatio, targetRatio }]

const ratio = rebalancer.getPortfolioRatio(balances, Decimal.from("50"));
// Current USDC ratio across entire portfolio
```

## Arbitrage Executor

Execute multi-leg arbitrage with automatic rollback on partial failure:

```typescript
import { ArbitrageExecutor, Decimal, unwrap } from "@polybot/sdk";

const arbExecutor = unwrap(ArbitrageExecutor.create(executor, {
  feeRate: Decimal.from("0.002"),
  sizeSafetyFactor: Decimal.from("0.8"),
  minNetProfit: Decimal.from("1"),
  maxExposure: Decimal.from("1000"),
  availableBalance: Decimal.from("5000"),
}));

const result = await arbExecutor.execute(opportunity, conditionId);
if (result.ok) {
  result.value.size;    // Executed size
  result.value.orders;  // Order intents submitted
  result.value.results; // Execution results
}
// On partial failure: automatically cancels successful legs (rollback)
```

## Combined Workflow

A typical multi-market strategy workflow:

1. **Scan** — `MarketScanner.scan()` ranks available markets
2. **Select** — `selectTop()` picks best markets with rotation hysteresis
3. **Subscribe** — `MultiMarketManager.addMarket()` for each selected market
4. **Detect** — Strategy detectors evaluate each market's orderbook
5. **Execute** — Submit orders via executor
6. **Rebalance** — Periodically rebalance portfolio with `Rebalancer`
7. **Arbitrage** — `ArbitrageExecutor` for cross-market opportunities
