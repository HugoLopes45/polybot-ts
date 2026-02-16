# Analytics

25+ technical indicators with Decimal precision.

## Price Indicators

```typescript
import { calcSMA, calcEMA, calcRSI, calcBollingerBands } from "@polybot/sdk";

const closes = candles.map(c => c.close);

const sma = calcSMA(closes, 20);
const ema = calcEMA(closes, 12);
const rsi = calcRSI(closes, 14);
const bands = calcBollingerBands(closes);
```

## Orderbook Analytics

```typescript
import { calcImbalanceRatio, calcVWAP, calcSpreadBps, estimateSlippage } from "@polybot/sdk";

const imbalance = calcImbalanceRatio(bids, asks, 5);
const vwap = calcVWAP(bids, asks);
const spreadBps = calcSpreadBps(bids, asks);
const slippage = estimateSlippage(asks, size);
```

## Indicator Categories

| Category | Indicators |
|----------|------------|
| Price | SMA, EMA, RSI, Bollinger Bands |
| Volatility | ATR, Donchian, Keltner, Chandelier |
| Trend | MACD, ADX, Aroon, DEMA, TRIX, PSAR |
| Momentum | Stochastic, Williams %R, CCI, ROC, AO (Awesome Oscillator), StochRSI |
| Volume | OBV, VWMA, MFI, ADL, CMF, ForceIndex, NVI, VPT, PVO |
