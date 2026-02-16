# Pricing Models

Black-Scholes pricing, oracle aggregation, impact estimation, and spread calculators for prediction markets.

## Black-Scholes Binary Option Pricing

```typescript
import { binaryCallPrice, binaryPutPrice, calcEdge, Decimal } from "@polybot/sdk";

const fairPrice = binaryCallPrice({
  spot: Decimal.from("0.45"),
  vol: Decimal.from("0.80"),
  timeToExpiry: Decimal.from("0.0833"), // ~30 days
  riskFreeRate: Decimal.from("0.00"),
});

const putPrice = binaryPutPrice({ /* same inputs */ });
const edge = calcEdge(fairPrice, Decimal.from("0.42")); // fair - market
```

## Weighted Oracle

Aggregate prices from multiple sources with staleness decay:

```typescript
import { WeightedOracle, SystemClock, Decimal } from "@polybot/sdk";

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

oracle.update({ source: "clob", price: Decimal.from("0.45"), timestampMs: Date.now() });
const result = oracle.aggregate();
// result.price, result.activeSources, result.reliable
```

## Dutch Book Escape

When a position goes underwater, exploit the YES+NO=$1 invariant to find the best recovery path:

```typescript
import { calculateEscapeRoute, Decimal } from "@polybot/sdk";

const escape = calculateEscapeRoute(
  "yes",                        // position side
  Decimal.from("0.70"),         // entry price
  Decimal.from("100"),          // size
  Decimal.from("0.40"),         // YES bid
  Decimal.from("0.45"),         // YES ask
  Decimal.from("0.55"),         // NO bid
  Decimal.from("0.60"),         // NO ask
);

escape.verdict;    // "front_door" | "back_door" | "trapped"
escape.recovery;   // How much capital you recover
escape.hedgeCost;  // Cost of the hedge (back_door only)
escape.netPnl;     // Net P&L of the escape
```

**Front door**: Sell at current bid. **Back door**: Buy opposite side, creating a YES+NO pair worth $1 at settlement.

## Chainlink Oracle Tracking

Model Chainlink oracle dead zones to predict settlement values:

```typescript
import { ChainlinkTracker, SystemClock, Decimal } from "@polybot/sdk";

const tracker = ChainlinkTracker.create(
  { deviationThreshold: Decimal.from("0.005"), heartbeatMs: 3_600_000 },
  SystemClock,
);

const obs = {
  oracleValue: Decimal.from("0.50"),
  lastUpdateMs: Date.now() - 1_800_000, // 30min ago
  realSpot: Decimal.from("0.502"),
};

tracker.inDeadZone(obs);  // true if oracle won't update
const prediction = tracker.predictSettlement(obs, expiryMs);
// prediction.inDeadZone, prediction.predictedValue, prediction.confidence
```

## Logit Transfer Model

Map CEX prices to market probabilities via online logistic regression:

```typescript
import { LogitTransferModel, Decimal } from "@polybot/sdk";

const model = LogitTransferModel.create({ minR2: Decimal.from("0.5"), minSamples: 10 });

// Feed observations
model.observe(Decimal.from("45000"), Decimal.from("0.65"));
model.observe(Decimal.from("46000"), Decimal.from("0.70"));
// ... accumulate samples

const pred = model.predict(Decimal.from("47000"));
if (pred?.valid) {
  pred.predictedProb; // Predicted market probability
  pred.r2;            // Regression fit quality
}

model.isGhostBook(); // true if market is showing stale/fake liquidity
```

## Impact Model (Almgren-Chriss)

Estimate market impact and find optimal order size:

```typescript
import { estimateImpact, optimalSize, Decimal } from "@polybot/sdk";

const impact = estimateImpact({
  orderSize: Decimal.from("500"),
  adv: Decimal.from("10000"),      // Average daily volume
  volatility: Decimal.from("0.02"),
  price: Decimal.from("0.50"),
});

impact.temporaryImpact;  // Short-term price displacement
impact.permanentImpact;  // Long-term information impact
impact.totalImpactPct;   // Combined impact as percentage
impact.effectivePrice;   // Price after impact

// Find max order size for a given slippage budget
const maxSize = optimalSize(
  Decimal.from("0.01"),  // 1% max slippage
  Decimal.from("10000"), // ADV
  Decimal.from("0.02"),  // volatility
);
```

## Dynamic Spread

Calculate bid/ask offsets that adjust for volatility, time, and inventory:

```typescript
import { calcDynamicSpread, Decimal } from "@polybot/sdk";

const spread = calcDynamicSpread(
  {
    volatility: Decimal.from("0.03"),
    timeRemainingMs: 120_000,       // 2 minutes to expiry
    inventorySkew: Decimal.from("0.2"), // long-biased
  },
  {
    baseSpreadBps: Decimal.from("10"),
    volMultiplier: Decimal.from("2"),
    minSpreadBps: Decimal.from("5"),
    maxSpreadBps: Decimal.from("100"),
  },
);

spread.bidOffset;     // Wider on bid side (inventory skew)
spread.askOffset;     // Tighter on ask side
spread.halfSpreadBps; // Base half-spread before skew
```

## Expiry Spreader

Widen spreads as market approaches expiry (higher gamma risk):

```typescript
import { calcExpirySpread, defaultExpirySpreadConfig, Decimal } from "@polybot/sdk";

const config = defaultExpirySpreadConfig(10); // 10bps base

// Time-bucketed multipliers:
// <1min: 3x, <3min: 2x, <10min: 1.5x, <1hr: 1.2x, else: 1x
const adjustedSpread = calcExpirySpread(45_000, config); // 45s remaining → 30bps
```

## Pricing Module Summary

| Feature | Function/Class | Use Case |
|---------|---------------|----------|
| Binary pricing | `binaryCallPrice()` | Fair value estimation |
| Oracle aggregation | `WeightedOracle` | Multi-source price feeds |
| Dutch book escape | `calculateEscapeRoute()` | Underwater position recovery |
| Chainlink tracking | `ChainlinkTracker` | Settlement prediction |
| CEX→market transfer | `LogitTransferModel` | Cross-venue signal |
| Market impact | `estimateImpact()` | Execution cost estimation |
| Dynamic spread | `calcDynamicSpread()` | Market making |
| Expiry spread | `calcExpirySpread()` | Near-expiry risk |
