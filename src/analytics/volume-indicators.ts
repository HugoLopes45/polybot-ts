import { Decimal } from "../shared/decimal.js";
import { calcEMA } from "./indicators.js";
import type { Candle } from "./types.js";

// biome-ignore lint/style/noNonNullAssertion: bounds validated by callers
const at = (arr: readonly Decimal[], i: number): Decimal => arr[i]!;

// biome-ignore lint/style/noNonNullAssertion: bounds validated by callers
const atCandle = (arr: readonly Candle[], i: number): Candle => arr[i]!;

/**
 * Close Location Value: ((C-L)-(H-C))/(H-L)
 * Returns 0 if H == L
 */
const clv = (candle: Candle): Decimal => {
	const range = candle.high.sub(candle.low);
	if (range.isZero()) {
		return Decimal.zero();
	}
	const closeMinusLow = candle.close.sub(candle.low);
	const highMinusClose = candle.high.sub(candle.close);
	return closeMinusLow.sub(highMinusClose).div(range);
};

/**
 * Builds a full EMA series (all intermediate values) for use in PVO signal calculation.
 */
const calcEMASeries = (values: readonly Decimal[], period: number): Decimal[] | null => {
	if (values.length < period) {
		return null;
	}

	const multiplier = Decimal.from(2).div(Decimal.from(period + 1));
	const result: Decimal[] = [];

	// First EMA is the first value
	result.push(at(values, 0));

	// Subsequent EMAs
	for (let i = 1; i < values.length; i++) {
		const prevEMA = at(result, i - 1);
		const currentValue = at(values, i);
		const ema = currentValue.mul(multiplier).add(prevEMA.mul(Decimal.one().sub(multiplier)));
		result.push(ema);
	}

	return result;
};

/**
 * On-Balance Volume (OBV)
 * Cumulative indicator that adds volume on up days and subtracts on down days.
 *
 * @param candles - Array of candles
 * @returns OBV value or null if insufficient data
 */
export const calcOBV = (candles: readonly Candle[]): Decimal | null => {
	if (candles.length < 2) {
		return null;
	}

	let obv = Decimal.zero();

	for (let i = 1; i < candles.length; i++) {
		const current = atCandle(candles, i);
		const prev = atCandle(candles, i - 1);

		if (current.close.gt(prev.close)) {
			obv = obv.add(current.volume);
		} else if (current.close.lt(prev.close)) {
			obv = obv.sub(current.volume);
		}
		// If equal, obv unchanged
	}

	return obv;
};

/**
 * Volume-Weighted Moving Average (VWMA)
 * Average price weighted by volume over a period.
 *
 * @param candles - Array of candles
 * @param period - Lookback period (default 20)
 * @returns VWMA value or null if insufficient data or zero volume
 */
export const calcVWMA = (candles: readonly Candle[], period = 20): Decimal | null => {
	if (candles.length < period) {
		return null;
	}

	const startIdx = candles.length - period;
	let sumPriceVolume = Decimal.zero();
	let sumVolume = Decimal.zero();

	for (let i = startIdx; i < candles.length; i++) {
		const candle = atCandle(candles, i);
		sumPriceVolume = sumPriceVolume.add(candle.close.mul(candle.volume));
		sumVolume = sumVolume.add(candle.volume);
	}

	if (sumVolume.isZero()) {
		return null;
	}

	return sumPriceVolume.div(sumVolume);
};

/**
 * Money Flow Index (MFI)
 * Volume-weighted RSI using typical price.
 *
 * @param candles - Array of candles
 * @param period - Lookback period (default 14)
 * @returns MFI value (0-100) or null if insufficient data
 */
export const calcMFI = (candles: readonly Candle[], period = 14): Decimal | null => {
	// Need period + 1 candles (period changes in typical price)
	if (candles.length < period + 1) {
		return null;
	}

	// Calculate typical prices
	const typicalPrices: Decimal[] = [];
	for (let i = 0; i < candles.length; i++) {
		const candle = atCandle(candles, i);
		const tp = candle.high.add(candle.low).add(candle.close).div(Decimal.from(3));
		typicalPrices.push(tp);
	}

	// Calculate money flow for the period
	let positiveMF = Decimal.zero();
	let negativeMF = Decimal.zero();

	const startIdx = candles.length - period;
	for (let i = startIdx; i < candles.length; i++) {
		const currentTP = at(typicalPrices, i);
		const prevTP = at(typicalPrices, i - 1);
		const volume = atCandle(candles, i).volume;
		const rawMF = currentTP.mul(volume);

		if (currentTP.gt(prevTP)) {
			positiveMF = positiveMF.add(rawMF);
		} else if (currentTP.lt(prevTP)) {
			negativeMF = negativeMF.add(rawMF);
		}
		// If equal, ignore
	}

	// Handle edge cases
	if (negativeMF.isZero()) {
		return Decimal.from(100);
	}
	if (positiveMF.isZero()) {
		return Decimal.zero();
	}

	const mfr = positiveMF.div(negativeMF);
	const mfi = Decimal.from(100).sub(Decimal.from(100).div(Decimal.one().add(mfr)));

	return mfi;
};

/**
 * Accumulation/Distribution Line (ADL)
 * Cumulative indicator using money flow volume.
 *
 * @param candles - Array of candles
 * @returns ADL value or null if no data
 */
export const calcADL = (candles: readonly Candle[]): Decimal | null => {
	if (candles.length === 0) {
		return null;
	}

	let adl = Decimal.zero();

	for (let i = 0; i < candles.length; i++) {
		const candle = atCandle(candles, i);
		const mfv = clv(candle).mul(candle.volume);
		adl = adl.add(mfv);
	}

	return adl;
};

/**
 * Chaikin Money Flow (CMF)
 * Average money flow volume over volume for a period.
 *
 * @param candles - Array of candles
 * @param period - Lookback period (default 20)
 * @returns CMF value or null if insufficient data or zero volume
 */
export const calcCMF = (candles: readonly Candle[], period = 20): Decimal | null => {
	if (candles.length < period) {
		return null;
	}

	const startIdx = candles.length - period;
	let sumMFV = Decimal.zero();
	let sumVolume = Decimal.zero();

	for (let i = startIdx; i < candles.length; i++) {
		const candle = atCandle(candles, i);
		const mfv = clv(candle).mul(candle.volume);
		sumMFV = sumMFV.add(mfv);
		sumVolume = sumVolume.add(candle.volume);
	}

	if (sumVolume.isZero()) {
		return null;
	}

	return sumMFV.div(sumVolume);
};

/**
 * Force Index
 * EMA of (close - prevClose) * volume.
 *
 * @param candles - Array of candles
 * @param period - EMA period (default 13)
 * @returns Force Index value or null if insufficient data
 */
export const calcForceIndex = (candles: readonly Candle[], period = 13): Decimal | null => {
	// Need period + 1 candles (period FI values for EMA)
	if (candles.length < period + 1) {
		return null;
	}

	// Calculate raw Force Index series
	const fiSeries: Decimal[] = [];
	for (let i = 1; i < candles.length; i++) {
		const current = atCandle(candles, i);
		const prev = atCandle(candles, i - 1);
		const fi = current.close.sub(prev.close).mul(current.volume);
		fiSeries.push(fi);
	}

	// Apply EMA to Force Index series
	return calcEMA(fiSeries, period);
};

/**
 * Negative Volume Index (NVI)
 * Tracks cumulative price changes on volume down days.
 *
 * @param candles - Array of candles
 * @param start - Starting NVI value (default 1000)
 * @returns NVI value or null if insufficient data
 */
export const calcNVI = (candles: readonly Candle[], start = 1000): Decimal | null => {
	if (candles.length < 2) {
		return null;
	}

	let nvi = Decimal.from(start);

	for (let i = 1; i < candles.length; i++) {
		const current = atCandle(candles, i);
		const prev = atCandle(candles, i - 1);

		// Skip if prevClose is zero
		if (prev.close.isZero()) {
			continue;
		}

		// Update only on volume decrease
		if (current.volume.lt(prev.volume)) {
			const priceChange = current.close.sub(prev.close).div(prev.close);
			nvi = nvi.mul(Decimal.one().add(priceChange));
		}
	}

	return nvi;
};

/**
 * Volume Price Trend (VPT)
 * Cumulative indicator of volume * percent price change.
 *
 * @param candles - Array of candles
 * @returns VPT value or null if insufficient data
 */
export const calcVPT = (candles: readonly Candle[]): Decimal | null => {
	if (candles.length < 2) {
		return null;
	}

	let vpt = Decimal.zero();

	for (let i = 1; i < candles.length; i++) {
		const current = atCandle(candles, i);
		const prev = atCandle(candles, i - 1);

		// Skip if prevClose is zero
		if (prev.close.isZero()) {
			continue;
		}

		const priceChange = current.close.sub(prev.close).div(prev.close);
		vpt = vpt.add(current.volume.mul(priceChange));
	}

	return vpt;
};

/**
 * Percentage Volume Oscillator (PVO)
 * MACD-style oscillator applied to volume.
 *
 * @param candles - Array of candles
 * @param fast - Fast EMA period (default 12)
 * @param slow - Slow EMA period (default 26)
 * @param signal - Signal line EMA period (default 9)
 * @returns PVO object with pvo, signal, histogram or null if insufficient data
 */
export const calcPVO = (
	candles: readonly Candle[],
	fast = 12,
	slow = 26,
	signal = 9,
): { readonly pvo: Decimal; readonly signal: Decimal; readonly histogram: Decimal } | null => {
	// Need slow + signal - 1 candles minimum
	const minData = slow + signal - 1;
	if (candles.length < minData) {
		return null;
	}

	// Extract volumes
	const volumes: Decimal[] = [];
	for (let i = 0; i < candles.length; i++) {
		volumes.push(atCandle(candles, i).volume);
	}

	// Build EMA series for fast and slow
	const fastEMASeries = calcEMASeries(volumes, fast);
	const slowEMASeries = calcEMASeries(volumes, slow);

	if (!fastEMASeries || !slowEMASeries) {
		return null;
	}

	// Build PVO series
	const pvoSeries: Decimal[] = [];
	for (let i = 0; i < fastEMASeries.length; i++) {
		const fastEMA = at(fastEMASeries, i);
		const slowEMA = at(slowEMASeries, i);

		// Skip if slowEMA is zero
		if (slowEMA.isZero()) {
			continue;
		}

		const pvo = fastEMA.sub(slowEMA).div(slowEMA).mul(Decimal.from(100));
		pvoSeries.push(pvo);
	}

	// Need at least signal period PVO values
	if (pvoSeries.length < signal) {
		return null;
	}

	// Build signal EMA series
	const signalSeries = calcEMASeries(pvoSeries, signal);
	if (!signalSeries) {
		return null;
	}

	// Return the latest values
	const latestPVO = at(pvoSeries, pvoSeries.length - 1);
	const latestSignal = at(signalSeries, signalSeries.length - 1);
	const histogram = latestPVO.sub(latestSignal);

	return {
		pvo: latestPVO,
		signal: latestSignal,
		histogram,
	};
};
