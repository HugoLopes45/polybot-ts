/**
 * Technical Indicator Showcase
 *
 * Demonstrates common technical indicators:
 * - Generates 50 synthetic close prices using a random walk with trend
 * - Computes: SMA(14), EMA(12), RSI(14), MACD, Bollinger Bands(20, 2)
 * - Prints the last value of each indicator
 */

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

function generateCandles(closes: readonly Decimal[]): Candle[] {
	const candles: Candle[] = [];

	for (let i = 0; i < closes.length; i++) {
		const close = closes[i];
		if (close === undefined) continue;

		const open = i > 0 ? closes[i - 1] ?? close : close;
		const volatility = Decimal.from((Math.random() * 0.02).toString());
		const high = Decimal.max(open, close).add(volatility);
		const low = Decimal.min(open, close).sub(volatility);

		const candle = unwrap(
			createCandle({
				open,
				high,
				low,
				close,
				volume: Decimal.from("1000"),
				timestampMs: i * 60000,
			}),
		);
		candles.push(candle);
	}

	return candles;
}

const closes = generatePrices(50);
const candles = generateCandles(closes);

const sma = calcSMA(closes, 14);
const ema = calcEMA(closes, 12);
const rsi = calcRSI(closes, 14);
const macd = calcMACD(candles);
const bollinger = calcBollingerBands(closes, 20, 2);

console.log("Technical Indicator Showcase");
console.log("============================\n");

console.log(`Generated ${closes.length} prices`);
console.log(`Current Price: ${closes[closes.length - 1]?.toString() ?? "N/A"}\n`);

console.log("Indicators:");
console.log(`  SMA(14):           ${sma?.toString() ?? "N/A"}`);
console.log(`  EMA(12):           ${ema?.toString() ?? "N/A"}`);
console.log(`  RSI(14):           ${rsi?.toString() ?? "N/A"}`);

if (macd !== null) {
	console.log(`  MACD:              ${macd.macd.toString()}`);
	console.log(`  MACD Signal:       ${macd.signal.toString()}`);
	console.log(`  MACD Histogram:    ${macd.histogram.toString()}`);
} else {
	console.log(`  MACD:              N/A`);
}

if (bollinger !== null) {
	console.log(`  Bollinger Upper:   ${bollinger.upper.toString()}`);
	console.log(`  Bollinger Middle:  ${bollinger.middle.toString()}`);
	console.log(`  Bollinger Lower:   ${bollinger.lower.toString()}`);
} else {
	console.log(`  Bollinger Bands:   N/A`);
}
