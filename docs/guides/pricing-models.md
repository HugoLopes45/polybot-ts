# Pricing Models

Black-Scholes, Dutch book, WeightedOracle, and spread calculators.

## Black-Scholes Binary Option Pricing

```typescript
import { binaryCallPrice, Decimal } from "@polybot/sdk";

const fairPrice = binaryCallPrice({
  spot: Decimal.from("0.45"),           // Current probability estimate
  vol: Decimal.from("0.80"),            // Implied volatility (80%)
  timeToExpiry: Decimal.from(0.0833),   // ~30 days / 365
  riskFreeRate: Decimal.from("0.00"),   // Optional, defaults to 0
});
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
    maxDivergence: Decimal.from("0.05"), // 5% max divergence
    minActiveSources: 1,
  },
  SystemClock
);

oracle.update({
  source: "clob",
  price: Decimal.from("0.45"),
  timestampMs: Date.now(),
});

const result = oracle.aggregate();
if (result !== null) {
  // result.price, result.activeSources, result.reliable
}
```

## Pricing Input Fields

```typescript
interface PricingInput {
  spot: Decimal;          // Current spot price / probability (0-1)
  vol: Decimal;           // Implied volatility (e.g., 0.80 for 80%)
  timeToExpiry: Decimal;  // Time to expiry in years
  riskFreeRate?: Decimal; // Risk-free rate (optional, default 0)
}
```
