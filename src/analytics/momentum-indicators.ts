import { Decimal } from "../shared/decimal.js";
import { at, atCandle, slidingHigh, slidingLow } from "./helpers.js";
import { calcSMA } from "./indicators.js";
import type { Candle, StochasticResult } from "./types.js";

function calcRSISeries(closes: readonly Decimal[], period: number): Decimal[] {
	if (closes.length < period + 1) {
		return [];
	}

	const changes: Decimal[] = [];
	for (let i = 1; i < closes.length; i++) {
		changes.push(at(closes, i).sub(at(closes, i - 1)));
	}

	let sumGain = Decimal.zero();
	let sumLoss = Decimal.zero();

	for (let i = 0; i < period; i++) {
		const change = at(changes, i);
		if (change.gt(Decimal.zero())) {
			sumGain = sumGain.add(change);
		} else {
			sumLoss = sumLoss.add(change.abs());
		}
	}

	let avgGain = sumGain.div(Decimal.from(period));
	let avgLoss = sumLoss.div(Decimal.from(period));

	const rsiValues: Decimal[] = [];
	const periodDec = Decimal.from(period);
	const one = Decimal.from(1);
	const hundred = Decimal.from(100);

	const computeRSI = (gain: Decimal, loss: Decimal): Decimal => {
		if (loss.isZero()) {
			return hundred;
		}
		const rs = gain.div(loss);
		return hundred.sub(hundred.div(one.add(rs)));
	};

	rsiValues.push(computeRSI(avgGain, avgLoss));

	for (let i = period; i < changes.length; i++) {
		const change = at(changes, i);
		const gain = change.gt(Decimal.zero()) ? change : Decimal.zero();
		const loss = change.lt(Decimal.zero()) ? change.abs() : Decimal.zero();

		avgGain = avgGain.mul(periodDec.sub(one)).add(gain).div(periodDec);
		avgLoss = avgLoss.mul(periodDec.sub(one)).add(loss).div(periodDec);

		rsiValues.push(computeRSI(avgGain, avgLoss));
	}

	return rsiValues;
}

/**
 * Stochastic Oscillator
 *
 * Requires at least `kPeriod + dPeriod - 1` candles.
 *
 * @param candles - Array of candles
 * @param kPeriod - %K lookback period (default 14)
 * @param dPeriod - %D smoothing period (default 3)
 * @returns Stochastic components (k/d) or null if insufficient data
 */
export function calcStochastic(
	candles: readonly Candle[],
	kPeriod = 14,
	dPeriod = 3,
): StochasticResult | null {
	if (kPeriod < 1 || dPeriod < 1) {
		return null;
	}

	const minCandles = kPeriod + dPeriod - 1;
	if (candles.length < minCandles) {
		return null;
	}

	const highs = candles.map((c) => c.high);
	const lows = candles.map((c) => c.low);
	const closes = candles.map((c) => c.close);

	const kValues: Decimal[] = [];
	const hundred = Decimal.from(100);
	const fifty = Decimal.from(50);

	for (let i = kPeriod - 1; i < candles.length; i++) {
		const startIdx = i - kPeriod + 1;
		const highestHigh = slidingHigh(highs, startIdx, i);
		const lowestLow = slidingLow(lows, startIdx, i);
		const close = at(closes, i);

		let k: Decimal;
		if (highestHigh.eq(lowestLow)) {
			k = fifty;
		} else {
			const range = highestHigh.sub(lowestLow);
			k = close.sub(lowestLow).div(range).mul(hundred);
		}
		kValues.push(k);
	}

	if (kValues.length < dPeriod) {
		return null;
	}

	const lastK = at(kValues, kValues.length - 1);
	const d = calcSMA(kValues, dPeriod);

	if (d === null) {
		return null;
	}

	return { k: lastK, d };
}

/**
 * Williams %R
 *
 * Requires at least `period` candles.
 *
 * @param candles - Array of candles
 * @param period - Lookback period (default 14)
 * @returns Williams %R value or null if insufficient data
 */
export function calcWilliamsR(candles: readonly Candle[], period = 14): Decimal | null {
	if (period < 1 || candles.length < period) {
		return null;
	}

	const highs = candles.map((c) => c.high);
	const lows = candles.map((c) => c.low);
	const close = atCandle(candles, candles.length - 1).close;

	const endIdx = candles.length - 1;
	const startIdx = endIdx - period + 1;
	const highestHigh = slidingHigh(highs, startIdx, endIdx);
	const lowestLow = slidingLow(lows, startIdx, endIdx);

	if (highestHigh.eq(lowestLow)) {
		return Decimal.from(-50);
	}

	const range = highestHigh.sub(lowestLow);
	const negHundred = Decimal.from(-100);

	return highestHigh.sub(close).div(range).mul(negHundred);
}

/**
 * Commodity Channel Index (CCI)
 *
 * Requires at least `period` candles.
 *
 * @param candles - Array of candles
 * @param period - Lookback period (default 20)
 * @returns CCI value or null if insufficient data
 */
export function calcCCI(candles: readonly Candle[], period = 20): Decimal | null {
	if (period < 1 || candles.length < period) {
		return null;
	}

	const three = Decimal.from(3);
	const typicalPrices: Decimal[] = [];

	for (let i = candles.length - period; i < candles.length; i++) {
		const c = atCandle(candles, i);
		const tp = c.high.add(c.low).add(c.close).div(three);
		typicalPrices.push(tp);
	}

	const smaTP = calcSMA(typicalPrices, period);
	if (smaTP === null) {
		return null;
	}

	let sumAbsDev = Decimal.zero();
	for (const tp of typicalPrices) {
		sumAbsDev = sumAbsDev.add(tp.sub(smaTP).abs());
	}

	const meanDev = sumAbsDev.div(Decimal.from(period));

	if (meanDev.isZero()) {
		return Decimal.zero();
	}

	const lastTP = at(typicalPrices, typicalPrices.length - 1);
	const constant = Decimal.from("0.015");

	return lastTP.sub(smaTP).div(constant.mul(meanDev));
}

/**
 * Rate of Change (ROC)
 *
 * Requires at least `period + 1` data points.
 *
 * @param closes - Array of closing prices
 * @param period - Lookback period (default 12)
 * @returns ROC value (percentage) or null if insufficient data
 */
export function calcROC(closes: readonly Decimal[], period = 12): Decimal | null {
	if (period < 1 || closes.length < period + 1) {
		return null;
	}

	const currentClose = at(closes, closes.length - 1);
	const historicalClose = at(closes, closes.length - 1 - period);

	if (historicalClose.isZero()) {
		return null;
	}

	const hundred = Decimal.from(100);
	return currentClose.sub(historicalClose).div(historicalClose).mul(hundred);
}

/**
 * Awesome Oscillator (AO)
 *
 * Requires at least `slow` candles.
 *
 * @param candles - Array of candles
 * @param fast - Fast SMA period (default 5)
 * @param slow - Slow SMA period (default 34)
 * @returns AO value or null if insufficient data
 */
export function calcAO(candles: readonly Candle[], fast = 5, slow = 34): Decimal | null {
	if (fast < 1 || slow < 1 || candles.length < slow) {
		return null;
	}

	const medianPrices = candles.map((c) => c.high.add(c.low).div(Decimal.from(2)));

	const fastSMA = calcSMA(medianPrices, fast);
	const slowSMA = calcSMA(medianPrices, slow);

	if (fastSMA === null || slowSMA === null) {
		return null;
	}

	return fastSMA.sub(slowSMA);
}

/**
 * Stochastic RSI
 *
 * Requires at least `rsiPeriod + stochPeriod + kPeriod + dPeriod - 1` data points.
 *
 * @param closes - Array of closing prices
 * @param rsiPeriod - RSI calculation period (default 14)
 * @param stochPeriod - Stochastic lookback period (default 14)
 * @param kPeriod - %K smoothing period (default 3)
 * @param dPeriod - %D smoothing period (default 3)
 * @returns StochRSI components (k/d) or null if insufficient data
 */
export function calcStochRSI(
	closes: readonly Decimal[],
	rsiPeriod = 14,
	stochPeriod = 14,
	kPeriod = 3,
	dPeriod = 3,
): StochasticResult | null {
	if (rsiPeriod < 1 || stochPeriod < 1 || kPeriod < 1 || dPeriod < 1) {
		return null;
	}

	const minCloses = rsiPeriod + stochPeriod + kPeriod + dPeriod - 1;
	if (closes.length < minCloses) {
		return null;
	}

	const rsiSeries = calcRSISeries(closes, rsiPeriod);
	if (rsiSeries.length < stochPeriod + kPeriod + dPeriod - 1) {
		return null;
	}

	const stochRSIRaw: Decimal[] = [];
	const hundred = Decimal.from(100);
	const fifty = Decimal.from(50);

	for (let i = stochPeriod - 1; i < rsiSeries.length; i++) {
		let maxRSI = at(rsiSeries, i - stochPeriod + 1);
		let minRSI = at(rsiSeries, i - stochPeriod + 1);

		for (let j = i - stochPeriod + 2; j <= i; j++) {
			const rsi = at(rsiSeries, j);
			if (rsi.gt(maxRSI)) {
				maxRSI = rsi;
			}
			if (rsi.lt(minRSI)) {
				minRSI = rsi;
			}
		}

		const currentRSI = at(rsiSeries, i);

		let stochVal: Decimal;
		if (maxRSI.eq(minRSI)) {
			stochVal = fifty;
		} else {
			const range = maxRSI.sub(minRSI);
			stochVal = currentRSI.sub(minRSI).div(range).mul(hundred);
		}

		stochRSIRaw.push(stochVal);
	}

	if (stochRSIRaw.length < kPeriod + dPeriod - 1) {
		return null;
	}

	const kValues: Decimal[] = [];
	for (let i = kPeriod - 1; i < stochRSIRaw.length; i++) {
		const kWindow = stochRSIRaw.slice(i - kPeriod + 1, i + 1);
		const kSMA = calcSMA(kWindow, kPeriod);
		if (kSMA === null) {
			return null;
		}
		kValues.push(kSMA);
	}

	if (kValues.length < dPeriod) {
		return null;
	}

	const k = at(kValues, kValues.length - 1);
	const d = calcSMA(kValues, dPeriod);

	if (d === null) {
		return null;
	}

	return { k, d };
}
