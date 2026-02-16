# Indicator Showcase

Computes common technical indicators on synthetic price data.

```typescript
import {
  Decimal,
  calcSMA,
  calcEMA,
  calcRSI,
  calcMACD,
  calcBollingerBands,
  type Candle,
  createCandle,
  unwrap,
} from "@polybot/sdk";

// Generate 50 synthetic close prices
function generatePrices(count: number): Decimal[] {
  const prices: Decimal[] = [];
  let price = 0.5;
  for (let i = 0; i < count; i++) {
    const trend = Math.sin(i / 10) * 0.01;
    const noise = (Math.random() - 0.5) * 0.02;
    price = Math.max(0.01, Math.min(0.99, price + trend + noise));
    prices.push(Decimal.from(price));
  }
  return prices;
}

const closes = generatePrices(50);

// Compute indicators
const sma = calcSMA(closes, 14);
const ema = calcEMA(closes, 12);
const rsi = calcRSI(closes, 14);
const bollinger = calcBollingerBands(closes, 20, 2);

console.log(`SMA(14):  ${sma?.toString() ?? "N/A"}`);
console.log(`EMA(12):  ${ema?.toString() ?? "N/A"}`);
console.log(`RSI(14):  ${rsi?.toString() ?? "N/A"}`);
if (bollinger) {
  console.log(`Bollinger Upper:  ${bollinger.upper.toString()}`);
  console.log(`Bollinger Middle: ${bollinger.middle.toString()}`);
  console.log(`Bollinger Lower:  ${bollinger.lower.toString()}`);
}
```

## Available Indicators

| Category | Indicators |
|----------|-----------|
| Trend | SMA, EMA, DEMA, TRIX, MACD, ADX, Aroon, PSAR |
| Momentum | RSI, Stochastic, Williams %R, CCI, ROC, AO, StochRSI |
| Volatility | ATR, Bollinger Bands, Donchian, Keltner, Chandelier Exit |
| Volume | OBV, VWMA, MFI, ADL, CMF, Force Index, NVI, VPT, PVO |

## Running

```bash
npx tsx examples/indicator-showcase.ts
```
