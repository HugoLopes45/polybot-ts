# Microstructure Analysis

VPIN, Order Flow Imbalance, and correlation tracking for informed trading detection.

## What is Microstructure Analysis?

Market microstructure studies how order flow, trade patterns, and book dynamics reveal information about future price movements. The SDK provides three microstructure tools that can serve as guard inputs or signal enhancers.

## VPIN — Volume-Synchronized Probability of Informed Trading

VPIN measures the imbalance between buy and sell volume in fixed-size buckets. High VPIN (>0.5) suggests informed trading activity:

```typescript
import { VpinTracker, Decimal } from "@polybot/sdk";

const vpin = VpinTracker.create({
  bucketSize: Decimal.from("1000"),  // Volume per bucket
  numBuckets: 50,                     // Rolling window
});

// Feed trade updates
vpin.update({ price: Decimal.from("0.55"), size: Decimal.from("100"), timestampMs: Date.now() });
vpin.update({ price: Decimal.from("0.54"), size: Decimal.from("150"), timestampMs: Date.now() });

const value = vpin.value(); // Decimal | null (null until enough buckets)
// VPIN ∈ [0, 1]: 0 = balanced flow, 1 = fully one-sided
vpin.filledBuckets; // Number of completed buckets
```

**Trade classification**: Uses the tick rule — price > lastPrice = buy, price < lastPrice = sell, unchanged = same as last direction.

## OFI — Order Flow Imbalance

OFI tracks changes in best bid/ask queue sizes between orderbook snapshots. Positive OFI = buying pressure:

```typescript
import { OfiTracker, Decimal } from "@polybot/sdk";

const ofi = OfiTracker.create();

// Feed orderbook snapshots
const delta1 = ofi.update({
  bestBid: { price: Decimal.from("0.50"), size: Decimal.from("500") },
  bestAsk: { price: Decimal.from("0.52"), size: Decimal.from("300") },
});
// First call returns null (needs two snapshots)

const delta2 = ofi.update({
  bestBid: { price: Decimal.from("0.50"), size: Decimal.from("600") }, // +100
  bestAsk: { price: Decimal.from("0.52"), size: Decimal.from("250") }, // -50
});
// delta2 = 150 (bid grew +100, ask shrank -50 → net buying pressure)

ofi.cumulative(); // Running sum of all OFI deltas
ofi.reset();      // Clear state
```

**OFI signal interpretation**:
- Persistent positive OFI → sustained buying pressure → bullish
- Sudden OFI spike → large order activity → potential informed trading
- OFI diverging from price → possible reversal signal

## Correlation Engine

Track rolling Pearson correlation between two price series with regime shift detection:

```typescript
import { CorrelationEngine, Decimal } from "@polybot/sdk";

const corr = CorrelationEngine.create({
  windowSize: 50,                                    // Rolling window
  regimeShiftThreshold: Decimal.from("0.3"),         // Alert if |Δcorr| > 0.3
});

// Feed paired observations (e.g., CEX price vs market probability)
const result = corr.update(Decimal.from("45000"), Decimal.from("0.65"));
// null until >= 2 samples

if (result) {
  result.correlation;   // Current rolling correlation
  result.regimeShift;   // true if correlation changed significantly
  result.prevCorrelation; // Previous value for comparison
  result.sampleCount;   // Samples in current window
}

corr.reset(); // Clear buffer
```

**Use cases**: Detect when a prediction market decouples from its reference asset (correlation breakdown → potential arb or regime change).

## Combining Signals as Guard Inputs

Use microstructure metrics as custom guard conditions:

```typescript
// In your signal detector:
detectEntry(ctx) {
  const vpinValue = this.vpinTracker.value();
  const ofiDelta = this.ofiTracker.cumulative();

  // Skip entry if VPIN suggests informed trading against us
  if (vpinValue && vpinValue.gt(Decimal.from("0.7"))) {
    return null; // Too much informed activity
  }

  // Require positive OFI (buying pressure) for long entries
  if (ofiDelta.isNegative()) {
    return null;
  }

  // Normal signal detection logic...
}
```
