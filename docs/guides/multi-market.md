# Multi-Market Strategies

Managing multiple prediction markets simultaneously with scanning, WebSocket feeds, and portfolio rebalancing.

## MultiMarketManager

Subscribe to orderbook feeds for multiple markets via a single WebSocket connection:

```typescript
import { MultiMarketManager, WsManager, conditionId } from "@polybot/sdk";

const ws = new WsManager({ url: "wss://ws-subscriptions-clob.polymarket.com/ws/market" });
const manager = new MultiMarketManager(ws);

// Add markets to track
manager.addMarket(conditionId("0xMarket1..."));
manager.addMarket(conditionId("0xMarket2..."));
manager.addMarket(conditionId("0xMarket3..."));

// Query live orderbooks
const book = manager.getBook(conditionId("0xMarket1..."));
if (book) {
  book.bids; // Current bid levels
  book.asks; // Current ask levels
  book.timestampMs; // Last update time
}

// Remove a market when done
manager.removeMarket(conditionId("0xMarket2..."));
```

## Market Selection with Scanner

Use `MarketScanner` to automatically select the best markets to trade:

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

// Score all candidate markets
const scores = scanner.scan(marketSnapshots, Date.now());

// Select top 5, respecting rotation hysteresis
const selected = scanner.selectTop(scores, 5, currentMarketIds);
```

### Rotation Hysteresis

`selectTop()` only replaces a current market if the new candidate's score exceeds the worst current market's score by `rotationThreshold`. This prevents excessive churn when markets are similarly scored.

## Portfolio Rebalancing

Keep your portfolio balanced across positions:

```typescript
import { Rebalancer, Decimal, unwrap } from "@polybot/sdk";

const rebalancer = unwrap(Rebalancer.create({
  targetUsdcRatio: Decimal.from("0.3"),    // Keep 30% in USDC
  tolerance: Decimal.from("0.05"),          // 5% tolerance band
  minRebalanceUsdc: Decimal.from("10"),     // Ignore < $10 imbalances
}));

const actions = unwrap(rebalancer.calculateRebalance(balances, usdcBalance));
for (const action of actions) {
  // action.tokenId, action.action ("buy"|"sell"), action.amount
}
```

## Typical Multi-Market Workflow

```
┌─────────┐     ┌──────────┐     ┌────────────┐
│  Scan   │────→│  Select  │────→│ Subscribe  │
│ markets │     │  top N   │     │  WS feeds  │
└─────────┘     └──────────┘     └────────────┘
                                       │
      ┌────────────┐     ┌─────────────┘
      │ Rebalance  │←────│  Tick loop  │
      │ portfolio  │     │  per market │
      └────────────┘     └─────────────┘
```

1. **Scan**: `MarketScanner.scan()` scores all candidate markets
2. **Select**: `selectTop()` picks the best N with rotation hysteresis
3. **Subscribe**: `MultiMarketManager.addMarket()` for each selected market
4. **Tick**: Strategy detectors run per-market on each orderbook update
5. **Rebalance**: Periodically rebalance with `Rebalancer.calculateRebalance()`
