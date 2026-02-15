import { Decimal } from "../shared/decimal.js";
import { at, atCandle, slidingHigh, slidingLow, trueRange } from "./helpers.js";
import { calcEMA } from "./indicators.js";
import type { BandResult, Candle } from "./types.js";

/**
 * Average True Range (ATR)
 *
 * Requires at least `period + 1` candles.
 *
 * @param candles - Array of candles
 * @param period - Lookback period (default 14)
 * @returns ATR value or null if insufficient data
 */
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

/**
 * Donchian Channels
 *
 * Requires at least `period` candles.
 *
 * @param candles - Array of candles
 * @param period - Lookback period (default 20)
 * @returns Donchian channels (upper/middle/lower) or null if insufficient data
 */
export function calcDonchian(candles: readonly Candle[], period = 20): BandResult | null {
	if (period < 1 || candles.length < period) {
		return null;
	}

	const highs = candles.map((c) => c.high);
	const lows = candles.map((c) => c.low);

	const endIdx = candles.length - 1;
	const startIdx = endIdx - period + 1;
	const upper = slidingHigh(highs, startIdx, endIdx);
	const lower = slidingLow(lows, startIdx, endIdx);
	const middle = upper.add(lower).div(Decimal.from(2));

	return { upper, middle, lower };
}

/**
 * Keltner Channels
 *
 * Requires at least `period + 1` candles.
 *
 * @param candles - Array of candles
 * @param period - Lookback period (default 20)
 * @param mult - ATR multiplier (default 2)
 * @returns Keltner channels (upper/middle/lower) or null if insufficient data
 */
export function calcKeltner(candles: readonly Candle[], period = 20, mult = 2): BandResult | null {
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

/**
 * Chandelier Exit
 *
 * Requires at least `period + 1` candles.
 *
 * @param candles - Array of candles
 * @param period - Lookback period (default 22)
 * @param mult - ATR multiplier (default 3)
 * @returns Chandelier exits (long/short) or null if insufficient data
 */
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

	const endIdx = candles.length - 1;
	const startIdx = endIdx - period + 1;
	const highestHigh = slidingHigh(highs, startIdx, endIdx);
	const lowestLow = slidingLow(lows, startIdx, endIdx);

	const atr = calcATR(candles, period);

	if (atr === null) {
		return null;
	}

	const offset = atr.mul(Decimal.from(mult));
	const long = highestHigh.sub(offset);
	const short = lowestLow.add(offset);

	return { long, short };
}
