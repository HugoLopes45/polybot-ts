import { Decimal } from "../shared/decimal.js";
import { calcEMA } from "./indicators.js";
import type { Candle } from "./types.js";

function at(arr: readonly Decimal[], i: number): Decimal {
	// biome-ignore lint/style/noNonNullAssertion: bounds validated by callers
	return arr[i]!;
}

function atCandle(arr: readonly Candle[], i: number): Candle {
	// biome-ignore lint/style/noNonNullAssertion: bounds validated by callers
	return arr[i]!;
}

function trueRange(candle: Candle, prevClose: Decimal): Decimal {
	const hl = candle.high.sub(candle.low);
	const hc = candle.high.sub(prevClose).abs();
	const lc = candle.low.sub(prevClose).abs();

	return Decimal.max(hl, Decimal.max(hc, lc));
}

function slidingHigh(values: readonly Decimal[], period: number, endIdx: number): Decimal {
	const start = endIdx - period + 1;
	let max = at(values, start);

	for (let i = start + 1; i <= endIdx; i++) {
		const current = at(values, i);
		if (current.gt(max)) {
			max = current;
		}
	}

	return max;
}

function slidingLow(values: readonly Decimal[], period: number, endIdx: number): Decimal {
	const start = endIdx - period + 1;
	let min = at(values, start);

	for (let i = start + 1; i <= endIdx; i++) {
		const current = at(values, i);
		if (current.lt(min)) {
			min = current;
		}
	}

	return min;
}

export function calcATR(candles: readonly Candle[], period = 14): Decimal | null {
	if (period < 1 || candles.length < period + 1) {
		return null;
	}

	const trValues: Decimal[] = [];

	for (let i = 1; i < candles.length; i++) {
		const current = atCandle(candles, i);
		const prev = atCandle(candles, i - 1);
		trValues.push(trueRange(current, prev.close));
	}

	const firstATR = trValues
		.slice(0, period)
		.reduce((sum, tr) => sum.add(tr), Decimal.zero())
		.div(Decimal.from(period));

	let atr = firstATR;

	for (let i = period; i < trValues.length; i++) {
		const currentTR = at(trValues, i);
		atr = atr
			.mul(Decimal.from(period - 1))
			.add(currentTR)
			.div(Decimal.from(period));
	}

	return atr;
}

export function calcDonchian(
	candles: readonly Candle[],
	period = 20,
): { readonly upper: Decimal; readonly middle: Decimal; readonly lower: Decimal } | null {
	if (period < 1 || candles.length < period) {
		return null;
	}

	const highs = candles.map((c) => c.high);
	const lows = candles.map((c) => c.low);

	const upper = slidingHigh(highs, period, candles.length - 1);
	const lower = slidingLow(lows, period, candles.length - 1);
	const middle = upper.add(lower).div(Decimal.from(2));

	return { upper, middle, lower };
}

export function calcKeltner(
	candles: readonly Candle[],
	period = 20,
	mult = 2,
): { readonly upper: Decimal; readonly middle: Decimal; readonly lower: Decimal } | null {
	if (period < 1 || candles.length < period + 1) {
		return null;
	}

	const closes = candles.map((c) => c.close);
	const middle = calcEMA(closes, period);

	if (middle === null) {
		return null;
	}

	const atr = calcATR(candles, period);

	if (atr === null) {
		return null;
	}

	const offset = atr.mul(Decimal.from(mult));
	const upper = middle.add(offset);
	const lower = middle.sub(offset);

	return { upper, middle, lower };
}

export function calcChandelier(
	candles: readonly Candle[],
	period = 22,
	mult = 3,
): { readonly long: Decimal; readonly short: Decimal } | null {
	if (period < 1 || candles.length < period + 1) {
		return null;
	}

	const highs = candles.map((c) => c.high);
	const lows = candles.map((c) => c.low);

	const highestHigh = slidingHigh(highs, period, candles.length - 1);
	const lowestLow = slidingLow(lows, period, candles.length - 1);

	const atr = calcATR(candles, period);

	if (atr === null) {
		return null;
	}

	const offset = atr.mul(Decimal.from(mult));
	const long = highestHigh.sub(offset);
	const short = lowestLow.add(offset);

	return { long, short };
}
