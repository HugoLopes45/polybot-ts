# Analytics

25+ technical indicators and orderbook analytics — all operating on `Decimal` precision.

## KLine Aggregation

Build real-time candles from price ticks:

```typescript
import { KLineAggregator, createCandle } from "@polybot/sdk";

const aggregator = new KLineAggregator("1m"); // 1-minute candles

// Feed price ticks
aggregator.update(Decimal.from("0.55"), 100, Date.now());
aggregator.update(Decimal.from("0.57"), 50, Date.now() + 1000);

// Get the current (incomplete) candle
const candle = aggregator.current();
// { open, high, low, close, volume, timestampMs }
```

Supported intervals: `1m`, `5m`, `15m`, `1h`, `4h`, `1d`.

## Price Indicators

```typescript
import { calcSMA, calcEMA, calcRSI, calcBollingerBands } from "@polybot/sdk";

const closes = candles.map(c => c.close);

const sma = calcSMA(closes, 20);          // Simple Moving Average
const ema = calcEMA(closes, 12);          // Exponential Moving Average
const rsi = calcRSI(closes, 14);          // Relative Strength Index (0-100)
const bands = calcBollingerBands(closes);  // { upper, middle, lower }
```

**When to use**: SMA/EMA for trend direction, RSI for overbought/oversold (>70 / <30), Bollinger for volatility squeeze detection.

## Volatility Indicators

```typescript
import { calcATR, calcDonchian, calcKeltner, calcChandelier } from "@polybot/sdk";

const atr = calcATR(candles, 14);
// Average True Range — measures price volatility

const donchian = calcDonchian(candles, 20);
// { upper, lower, middle } — highest high / lowest low channel

const keltner = calcKeltner(candles);
// { upper, middle, lower } — EMA ± ATR-based envelope

const chandelier = calcChandelier(candles);
// { longStop, shortStop } — ATR-based trailing stop levels
```

**When to use**: ATR for position sizing and stop-loss distances. Donchian for breakout detection. Keltner for trend-following entries. Chandelier for trailing exit placement.

## Trend Indicators

```typescript
import { calcMACD, calcADX, calcAroon, calcDEMA, calcTRIX, calcPSAR } from "@polybot/sdk";

const macd = calcMACD(closes);
// { macd, signal, histogram } — trend momentum (12, 26, 9 defaults)

const adx = calcADX(candles, 14);
// Trend strength 0-100 — above 25 indicates trending

const aroon = calcAroon(candles, 25);
// { up, down } — time since highest high / lowest low (0-100)

const dema = calcDEMA(closes, 20);
// Double EMA — less lag than standard EMA

const trix = calcTRIX(closes, 15);
// Triple-smoothed EMA rate of change — filters noise

const psar = calcPSAR(candles);
// Parabolic SAR — trailing stop + reversal signal
```

**When to use**: MACD for trend direction + momentum. ADX to confirm trending vs ranging. Aroon for early trend detection. PSAR for dynamic stop-loss placement.

## Momentum Indicators

```typescript
import {
  calcStochastic, calcWilliamsR, calcCCI,
  calcROC, calcAO, calcStochRSI
} from "@polybot/sdk";

const stoch = calcStochastic(candles);
// { k, d } — %K and %D lines (0-100)

const willR = calcWilliamsR(candles, 14);
// Williams %R — momentum oscillator (-100 to 0)

const cci = calcCCI(candles, 20);
// Commodity Channel Index — deviation from average

const roc = calcROC(closes, 12);
// Rate of Change — percent change over N periods

const ao = calcAO(candles);
// Awesome Oscillator — 5/34 SMA of midpoints

const stochRsi = calcStochRSI(closes, 14);
// Stochastic RSI — RSI applied to RSI values (0-1)
```

**When to use**: Stochastic for overbought/oversold in ranging markets. Williams %R similar but inverted scale. CCI for cycle detection. ROC for momentum confirmation. StochRSI for more sensitive RSI signals.

## Volume Indicators

```typescript
import {
  calcOBV, calcVWMA, calcMFI, calcADL,
  calcCMF, calcForceIndex, calcNVI, calcVPT, calcPVO
} from "@polybot/sdk";

const obv = calcOBV(candles);          // On-Balance Volume — cumulative volume flow
const vwma = calcVWMA(candles, 20);    // Volume-Weighted Moving Average
const mfi = calcMFI(candles, 14);      // Money Flow Index — volume-weighted RSI (0-100)
const adl = calcADL(candles);          // Accumulation/Distribution Line
const cmf = calcCMF(candles, 20);      // Chaikin Money Flow (-1 to +1)
const force = calcForceIndex(candles); // Force Index — price change × volume
const nvi = calcNVI(candles);          // Negative Volume Index
const vpt = calcVPT(candles);          // Volume Price Trend
const pvo = calcPVO(candles);          // Percentage Volume Oscillator
```

**When to use**: OBV for volume confirmation of price moves. MFI as volume-weighted overbought/oversold. CMF for buying/selling pressure. ADL for divergence detection (price up + ADL down = bearish).

## Orderbook Analytics

```typescript
import {
  calcImbalanceRatio, calcVWAP, calcSpreadBps,
  estimateSlippage, calcBookDepth
} from "@polybot/sdk";

const imbalance = calcImbalanceRatio(bids, asks, 5);
// Bid/ask imbalance at top 5 levels (-1 to +1)

const vwap = calcVWAP(bids, asks);
// Volume-weighted average price across the book

const spreadBps = calcSpreadBps(bids, asks);
// Bid-ask spread in basis points

const slippage = estimateSlippage(asks, Decimal.from("1000"));
// Expected slippage for a $1000 market buy

const depth = calcBookDepth(bids, asks, Decimal.from("0.05"));
// Total size within 5% of mid price
```

## Complete Indicator Reference

| Category | Indicator | Function | Key Output |
|----------|-----------|----------|------------|
| **Price** | SMA | `calcSMA(closes, period)` | `Decimal` |
| | EMA | `calcEMA(closes, period)` | `Decimal` |
| | RSI | `calcRSI(closes, period)` | `Decimal` (0-100) |
| | Bollinger Bands | `calcBollingerBands(closes)` | `{ upper, middle, lower }` |
| **Volatility** | ATR | `calcATR(candles, period)` | `Decimal` |
| | Donchian Channel | `calcDonchian(candles, period)` | `{ upper, lower, middle }` |
| | Keltner Channel | `calcKeltner(candles)` | `{ upper, middle, lower }` |
| | Chandelier Exit | `calcChandelier(candles)` | `{ longStop, shortStop }` |
| **Trend** | MACD | `calcMACD(closes)` | `{ macd, signal, histogram }` |
| | ADX | `calcADX(candles, period)` | `Decimal` (0-100) |
| | Aroon | `calcAroon(candles, period)` | `{ up, down }` |
| | DEMA | `calcDEMA(closes, period)` | `Decimal` |
| | TRIX | `calcTRIX(closes, period)` | `Decimal` |
| | Parabolic SAR | `calcPSAR(candles)` | `{ longStop, shortStop }` |
| **Momentum** | Stochastic | `calcStochastic(candles)` | `{ k, d }` |
| | Williams %R | `calcWilliamsR(candles, period)` | `Decimal` (-100–0) |
| | CCI | `calcCCI(candles, period)` | `Decimal` |
| | ROC | `calcROC(closes, period)` | `Decimal` |
| | Awesome Oscillator | `calcAO(candles)` | `Decimal` |
| | Stochastic RSI | `calcStochRSI(closes, period)` | `Decimal` (0-1) |
| **Volume** | OBV | `calcOBV(candles)` | `Decimal` |
| | VWMA | `calcVWMA(candles, period)` | `Decimal` |
| | MFI | `calcMFI(candles, period)` | `Decimal` (0-100) |
| | ADL | `calcADL(candles)` | `Decimal` |
| | CMF | `calcCMF(candles, period)` | `Decimal` (-1–+1) |
| | Force Index | `calcForceIndex(candles)` | `Decimal` |
| | NVI | `calcNVI(candles)` | `Decimal` |
| | VPT | `calcVPT(candles)` | `Decimal` |
| | PVO | `calcPVO(candles)` | `Decimal` |

All indicator functions accept `Decimal[]` for price arrays and `Candle[]` for OHLCV data. Returns are always `Decimal` or `null` if insufficient data.
