# Pricing Example

Using Black-Scholes pricing and Dutch book escape analysis.

```typescript
import {
  Decimal,
  binaryCallPrice,
  calcEdge,
  calculateEscapeRoute,
  WeightedOracle,
  SystemClock,
} from "@polybot/sdk";

// Calculate fair value using Black-Scholes
const fairPrice = binaryCallPrice({
  spot: Decimal.from("0.48"),
  vol: Decimal.from("0.75"),
  timeToExpiry: Decimal.from("0.0417"), // ~15 days
  riskFreeRate: Decimal.from("0.00"),
});

const marketAsk = Decimal.from("0.42");
const edge = calcEdge(fairPrice, marketAsk);
// edge > 0 means market is underpriced → buy signal

// Aggregate prices from multiple sources
const oracle = WeightedOracle.create(
  {
    sources: [
      { name: "clob", weight: Decimal.from("0.6"), maxAgeMs: 10_000 },
      { name: "cpmm", weight: Decimal.from("0.4"), maxAgeMs: 30_000 },
    ],
    maxDivergence: Decimal.from("0.05"),
    minActiveSources: 1,
  },
  SystemClock,
);

oracle.update({ source: "clob", price: Decimal.from("0.50"), timestampMs: Date.now() });
oracle.update({ source: "cpmm", price: Decimal.from("0.49"), timestampMs: Date.now() });
const aggregated = oracle.aggregate();

// Analyze Dutch book escape for an underwater position
const escape = calculateEscapeRoute(
  "yes",
  Decimal.from("0.70"),  // entry price
  Decimal.from("100"),   // position size
  Decimal.from("0.40"),  // YES bid
  Decimal.from("0.45"),  // YES ask
  Decimal.from("0.55"),  // NO bid
  Decimal.from("0.60"),  // NO ask
);

escape.verdict;   // "front_door" | "back_door" | "trapped"
escape.recovery;  // Capital recovered
escape.netPnl;    // Net P&L of the escape
```

## How It Works

1. **binaryCallPrice** uses the Black-Scholes model adapted for binary options
2. **calcEdge** computes the difference between fair price and market price
3. **WeightedOracle** aggregates price feeds with staleness decay
4. **calculateEscapeRoute** finds the optimal exit path using the YES+NO=$1 invariant

## Running

```bash
npx tsx examples/pricing-demo.ts
```
