# Microstructure Example

Using VPIN and OFI trackers to detect informed trading activity.

```typescript
import {
  Decimal,
  VpinTracker,
  OfiTracker,
  CorrelationEngine,
} from "@polybot/sdk";

// Set up VPIN tracker
const vpin = VpinTracker.create({
  bucketSize: Decimal.from("500"),
  numBuckets: 20,
});

// Set up OFI tracker
const ofi = OfiTracker.create();

// Set up correlation engine
const corr = CorrelationEngine.create({
  windowSize: 30,
  regimeShiftThreshold: Decimal.from("0.3"),
});

// Simulate trade feed
const trades = [
  { price: Decimal.from("0.52"), size: Decimal.from("100"), timestampMs: 1000 },
  { price: Decimal.from("0.53"), size: Decimal.from("200"), timestampMs: 2000 },
  { price: Decimal.from("0.51"), size: Decimal.from("150"), timestampMs: 3000 },
  { price: Decimal.from("0.54"), size: Decimal.from("300"), timestampMs: 4000 },
];

for (const trade of trades) {
  vpin.update(trade);
}

const vpinValue = vpin.value();
// null until enough buckets filled, then Decimal in [0, 1]

// Simulate orderbook snapshots for OFI
ofi.update({
  bestBid: { price: Decimal.from("0.50"), size: Decimal.from("500") },
  bestAsk: { price: Decimal.from("0.52"), size: Decimal.from("300") },
});

const delta = ofi.update({
  bestBid: { price: Decimal.from("0.50"), size: Decimal.from("600") },
  bestAsk: { price: Decimal.from("0.52"), size: Decimal.from("250") },
});
// delta = 150 (net buying pressure)

// Track correlation between CEX price and market probability
corr.update(Decimal.from("45000"), Decimal.from("0.65"));
corr.update(Decimal.from("45500"), Decimal.from("0.66"));
```

## How It Works

1. **VpinTracker** classifies trades as buy/sell using the tick rule and fills volume buckets
2. **OfiTracker** measures queue changes at best bid/ask to detect pressure shifts
3. **CorrelationEngine** tracks rolling Pearson correlation with regime shift alerts

## Running

```bash
npx tsx examples/microstructure-demo.ts
```
