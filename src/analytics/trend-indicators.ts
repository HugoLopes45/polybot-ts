import { Decimal } from "../shared/decimal.js";
import { at, atCandle, trueRange } from "./helpers.js";
import { calcSMA } from "./indicators.js";
import type { Candle, MACDResult } from "./types.js";

function extractCloses(candles: readonly Candle[]): Decimal[] {
	return candles.map((c) => c.close);
}

function calcEMASeries(closes: readonly Decimal[], period: number): Decimal[] | null {
	if (period < 1 || closes.length < period) {
		return null;
	}

	const multiplier = Decimal.from(2).div(Decimal.from(period + 1));
	const ema: Decimal[] = [];

	const firstSMA = calcSMA(closes.slice(0, period), period);
	if (firstSMA === null) {
		return null;
	}

	ema.push(firstSMA);

	for (let i = period; i < closes.length; i++) {
		const price = at(closes, i);
		const prevEMA = at(ema, ema.length - 1);
		const newEMA = price.sub(prevEMA).mul(multiplier).add(prevEMA);
		ema.push(newEMA);
	}

	return ema;
}

function wilderSmooth(values: readonly Decimal[], period: number): Decimal[] {
	const smoothed: Decimal[] = [];

	const first = values
		.slice(0, period)
		.reduce((sum, v) => sum.add(v), Decimal.zero())
		.div(Decimal.from(period));

	smoothed.push(first);

	for (let i = period; i < values.length; i++) {
		const current = at(values, i);
		const prev = at(smoothed, smoothed.length - 1);
		const next = prev
			.mul(Decimal.from(period - 1))
			.add(current)
			.div(Decimal.from(period));
		smoothed.push(next);
	}

	return smoothed;
}

/**
 * MACD (Moving Average Convergence Divergence)
 *
 * Requires at least `slow + signal - 1` candles.
 *
 * @param candles - Array of candles
 * @param fast - Fast EMA period (default 12)
 * @param slow - Slow EMA period (default 26)
 * @param signal - Signal line EMA period (default 9)
 * @returns MACD components (macd/signal/histogram) or null if insufficient data
 */
export function calcMACD(
	candles: readonly Candle[],
	fast = 12,
	slow = 26,
	signal = 9,
): MACDResult | null {
	if (fast < 1 || slow < 1 || signal < 1 || candles.length < slow + signal - 1) {
		return null;
	}

	const closes = extractCloses(candles);

	const fastEMA = calcEMASeries(closes, fast);
	const slowEMA = calcEMASeries(closes, slow);

	if (fastEMA === null || slowEMA === null) {
		return null;
	}

	const macdSeries: Decimal[] = [];
	const startIdx = slow - fast;

	for (let i = 0; i < slowEMA.length; i++) {
		const fastVal = at(fastEMA, i + startIdx);
		const slowVal = at(slowEMA, i);
		macdSeries.push(fastVal.sub(slowVal));
	}

	if (macdSeries.length < signal) {
		return null;
	}

	const signalEMA = calcEMASeries(macdSeries, signal);

	if (signalEMA === null) {
		return null;
	}

	const macdValue = at(macdSeries, macdSeries.length - 1);
	const signalValue = at(signalEMA, signalEMA.length - 1);
	const histogram = macdValue.sub(signalValue);

	return { macd: macdValue, signal: signalValue, histogram };
}

/**
 * Average Directional Index (ADX)
 *
 * Requires at least `2 * period + 1` candles.
 *
 * @param candles - Array of candles
 * @param period - Lookback period (default 14)
 * @returns ADX components (adx/plusDI/minusDI) or null if insufficient data
 */
export function calcADX(
	candles: readonly Candle[],
	period = 14,
): { readonly adx: Decimal; readonly plusDI: Decimal; readonly minusDI: Decimal } | null {
	if (period < 1 || candles.length < 2 * period + 1) {
		return null;
	}

	const plusDM: Decimal[] = [];
	const minusDM: Decimal[] = [];
	const tr: Decimal[] = [];

	for (let i = 1; i < candles.length; i++) {
		const current = atCandle(candles, i);
		const prev = atCandle(candles, i - 1);

		const highDiff = current.high.sub(prev.high);
		const lowDiff = prev.low.sub(current.low);

		if (highDiff.gt(lowDiff) && highDiff.gt(Decimal.zero())) {
			plusDM.push(highDiff);
		} else {
			plusDM.push(Decimal.zero());
		}

		if (lowDiff.gt(highDiff) && lowDiff.gt(Decimal.zero())) {
			minusDM.push(lowDiff);
		} else {
			minusDM.push(Decimal.zero());
		}

		tr.push(trueRange(current, prev.close));
	}

	const smoothedPlusDM = wilderSmooth(plusDM, period);
	const smoothedMinusDM = wilderSmooth(minusDM, period);
	const smoothedTR = wilderSmooth(tr, period);

	const dx: Decimal[] = [];

	for (let i = 0; i < smoothedTR.length; i++) {
		const trVal = at(smoothedTR, i);

		if (trVal.eq(Decimal.zero())) {
			return null;
		}

		const plusDI = at(smoothedPlusDM, i).div(trVal).mul(Decimal.from(100));
		const minusDI = at(smoothedMinusDM, i).div(trVal).mul(Decimal.from(100));

		const sum = plusDI.add(minusDI);

		if (sum.eq(Decimal.zero())) {
			dx.push(Decimal.zero());
		} else {
			const dxVal = plusDI.sub(minusDI).abs().div(sum).mul(Decimal.from(100));
			dx.push(dxVal);
		}
	}

	if (dx.length < period) {
		return null;
	}

	const adxSeries = wilderSmooth(dx, period);

	if (adxSeries.length === 0) {
		return null;
	}

	const adx = at(adxSeries, adxSeries.length - 1);
	const lastTR = at(smoothedTR, smoothedTR.length - 1);
	const plusDI = at(smoothedPlusDM, smoothedPlusDM.length - 1)
		.div(lastTR)
		.mul(Decimal.from(100));
	const minusDI = at(smoothedMinusDM, smoothedMinusDM.length - 1)
		.div(lastTR)
		.mul(Decimal.from(100));

	return { adx, plusDI, minusDI };
}

/**
 * Aroon Indicator
 *
 * Requires at least `period + 1` candles.
 *
 * @param candles - Array of candles
 * @param period - Lookback period (default 25)
 * @returns Aroon components (up/down) or null if insufficient data
 */
export function calcAroon(
	candles: readonly Candle[],
	period = 25,
): { readonly up: Decimal; readonly down: Decimal } | null {
	if (period < 1 || candles.length < period + 1) {
		return null;
	}

	const window = candles.slice(-period - 1);
	let highestIdx = 0;
	let lowestIdx = 0;

	for (let i = 1; i < window.length; i++) {
		if (atCandle(window, i).high.gte(atCandle(window, highestIdx).high)) {
			highestIdx = i;
		}
		if (atCandle(window, i).low.lte(atCandle(window, lowestIdx).low)) {
			lowestIdx = i;
		}
	}

	const daysSinceHigh = window.length - 1 - highestIdx;
	const daysSinceLow = window.length - 1 - lowestIdx;

	const up = Decimal.from(period - daysSinceHigh)
		.div(Decimal.from(period))
		.mul(Decimal.from(100));
	const down = Decimal.from(period - daysSinceLow)
		.div(Decimal.from(period))
		.mul(Decimal.from(100));

	return { up, down };
}

/**
 * Double Exponential Moving Average (DEMA)
 *
 * Requires at least `2 * period - 1` data points.
 *
 * @param closes - Array of closing prices
 * @param period - Lookback period (default 12)
 * @returns DEMA value or null if insufficient data
 */
export function calcDEMA(closes: readonly Decimal[], period = 12): Decimal | null {
	if (period < 1 || closes.length < 2 * period - 1) {
		return null;
	}

	const ema1 = calcEMASeries(closes, period);
	if (ema1 === null) {
		return null;
	}

	const ema2 = calcEMASeries(ema1, period);
	if (ema2 === null) {
		return null;
	}

	const lastEma1 = at(ema1, ema1.length - 1);
	const lastEma2 = at(ema2, ema2.length - 1);

	return Decimal.from(2).mul(lastEma1).sub(lastEma2);
}

/**
 * TRIX (Triple Exponential Moving Average Oscillator)
 *
 * Requires at least `3 * period - 1` data points.
 *
 * @param closes - Array of closing prices
 * @param period - Lookback period (default 4)
 * @returns TRIX value (percent rate of change) or null if insufficient data
 */
export function calcTRIX(closes: readonly Decimal[], period = 4): Decimal | null {
	if (period < 1 || closes.length < 3 * period - 1) {
		return null;
	}

	const ema1 = calcEMASeries(closes, period);
	if (ema1 === null) {
		return null;
	}

	const ema2 = calcEMASeries(ema1, period);
	if (ema2 === null) {
		return null;
	}

	const ema3 = calcEMASeries(ema2, period);
	if (ema3 === null || ema3.length < 2) {
		return null;
	}

	const current = at(ema3, ema3.length - 1);
	const previous = at(ema3, ema3.length - 2);

	if (previous.eq(Decimal.zero())) {
		return null;
	}

	return current.sub(previous).div(previous).mul(Decimal.from(100));
}

/**
 * Parabolic SAR (Stop and Reverse)
 *
 * Requires at least 2 candles.
 *
 * @param candles - Array of candles
 * @param step - Acceleration factor step (default 0.02)
 * @param max - Maximum acceleration factor (default 0.2)
 * @returns Array of SAR values (one per candle) or null if insufficient data
 */
export function calcPSAR(
	candles: readonly Candle[],
	step = 0.02,
	max = 0.2,
): readonly Decimal[] | null {
	if (candles.length < 2) {
		return null;
	}

	const sar: Decimal[] = [];
	let isUptrend = true;
	let ep = atCandle(candles, 0).high;
	let af = Decimal.from(step);
	const stepDecimal = Decimal.from(step);
	const maxDecimal = Decimal.from(max);

	sar.push(atCandle(candles, 0).low);

	for (let i = 1; i < candles.length; i++) {
		const current = atCandle(candles, i);
		const prevSAR = at(sar, i - 1);

		let newSAR: Decimal;

		if (isUptrend) {
			newSAR = prevSAR.add(af.mul(ep.sub(prevSAR)));

			const prev1Low = atCandle(candles, i - 1).low;
			const prev2Low = i >= 2 ? atCandle(candles, i - 2).low : prev1Low;
			const minPrevLow = Decimal.min(prev1Low, prev2Low);

			if (newSAR.gt(minPrevLow)) {
				newSAR = minPrevLow;
			}

			if (current.high.gt(ep)) {
				ep = current.high;
				af = Decimal.min(af.add(stepDecimal), maxDecimal);
			}

			if (current.low.lt(newSAR)) {
				isUptrend = false;
				newSAR = ep;
				ep = current.low;
				af = stepDecimal;
			}
		} else {
			newSAR = prevSAR.sub(af.mul(prevSAR.sub(ep)));

			const prev1High = atCandle(candles, i - 1).high;
			const prev2High = i >= 2 ? atCandle(candles, i - 2).high : prev1High;
			const maxPrevHigh = Decimal.max(prev1High, prev2High);

			if (newSAR.lt(maxPrevHigh)) {
				newSAR = maxPrevHigh;
			}

			if (current.low.lt(ep)) {
				ep = current.low;
				af = Decimal.min(af.add(stepDecimal), maxDecimal);
			}

			if (current.high.gt(newSAR)) {
				isUptrend = true;
				newSAR = ep;
				ep = current.high;
				af = stepDecimal;
			}
		}

		sar.push(newSAR);
	}

	return sar;
}
