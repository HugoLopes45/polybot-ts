import { Decimal } from "../shared/decimal.js";
import { at } from "./helpers.js";
import type { BandResult } from "./types.js";

/**
 * Simple Moving Average over the last `period` closes.
 *
 * Requires at least `period` data points.
 *
 * @param closes - Array of closing prices
 * @param period - Lookback period
 * @returns SMA value or null if insufficient data or invalid period
 */
export function calcSMA(closes: readonly Decimal[], period: number): Decimal | null {
	if (period < 1 || closes.length < period) return null;

	let sum = Decimal.zero();
	for (let i = closes.length - period; i < closes.length; i++) {
		sum = sum.add(at(closes, i));
	}
	return sum.div(Decimal.from(period));
}

/**
 * Exponential Moving Average.
 *
 * Seeded with SMA of the first `period` values, then smoothed with
 * multiplier = 2/(period+1) for remaining values.
 *
 * Requires at least `period` data points.
 *
 * @param closes - Array of closing prices
 * @param period - Lookback period
 * @returns EMA value or null if insufficient data or invalid period
 */
export function calcEMA(closes: readonly Decimal[], period: number): Decimal | null {
	if (period < 1 || closes.length < period) return null;

	const multiplier = Decimal.from(2).div(Decimal.from(period + 1));
	const oneMinusK = Decimal.one().sub(multiplier);

	// Seed: SMA of first `period` values
	let sum = Decimal.zero();
	for (let i = 0; i < period; i++) {
		sum = sum.add(at(closes, i));
	}
	let ema = sum.div(Decimal.from(period));

	// Smooth remaining values
	for (let i = period; i < closes.length; i++) {
		ema = at(closes, i).mul(multiplier).add(ema.mul(oneMinusK));
	}

	return ema;
}

/**
 * Relative Strength Index using Wilder's smoothing.
 *
 * Requires at least `period + 1` data points (to compute `period` changes).
 * Returns 100 when avgLoss is zero (all gains), 0 when avgGain is zero (all losses).
 *
 * @param closes - Array of closing prices
 * @param period - Lookback period (default 14)
 * @returns RSI value (0-100) or null if insufficient data
 */
export function calcRSI(closes: readonly Decimal[], period = 14): Decimal | null {
	if (period < 1 || closes.length < period + 1) return null;

	const hundred = Decimal.from(100);
	const periodDec = Decimal.from(period);
	const periodMinus1 = Decimal.from(period - 1);

	// Compute price changes
	const changes: Decimal[] = [];
	for (let i = 1; i < closes.length; i++) {
		changes.push(at(closes, i).sub(at(closes, i - 1)));
	}

	// Initial average gain/loss over first `period` changes
	let avgGain = Decimal.zero();
	let avgLoss = Decimal.zero();
	for (let i = 0; i < period; i++) {
		const change = at(changes, i);
		if (change.isPositive()) {
			avgGain = avgGain.add(change);
		} else if (change.isNegative()) {
			avgLoss = avgLoss.add(change.abs());
		}
	}
	avgGain = avgGain.div(periodDec);
	avgLoss = avgLoss.div(periodDec);

	// Wilder's smoothing for remaining changes
	for (let i = period; i < changes.length; i++) {
		const change = at(changes, i);
		const gain = change.isPositive() ? change : Decimal.zero();
		const loss = change.isNegative() ? change.abs() : Decimal.zero();
		avgGain = avgGain.mul(periodMinus1).add(gain).div(periodDec);
		avgLoss = avgLoss.mul(periodMinus1).add(loss).div(periodDec);
	}

	if (avgLoss.isZero()) return hundred;
	if (avgGain.isZero()) return Decimal.zero();

	const rs = avgGain.div(avgLoss);
	return hundred.sub(hundred.div(Decimal.one().add(rs)));
}

/**
 * Bollinger Bands: middle (SMA) +/- stdDev * multiplier.
 *
 * Uses `Math.sqrt` on Decimal variance (sufficient precision for
 * prediction market prices bounded [0,1]).
 *
 * Requires at least `period` data points.
 *
 * @param closes - Array of closing prices
 * @param period - Lookback period (default 20)
 * @param stdDevMultiplier - Standard deviation multiplier (default 2)
 * @returns Bollinger Bands (upper/middle/lower) or null if insufficient data
 */
export function calcBollingerBands(
	closes: readonly Decimal[],
	period = 20,
	stdDevMultiplier = 2,
): BandResult | null {
	if (period < 1 || closes.length < period) return null;

	const middle = calcSMA(closes, period);
	if (middle === null) return null;

	// Compute variance over last `period` values
	let sumSquaredDiff = Decimal.zero();
	for (let i = closes.length - period; i < closes.length; i++) {
		const diff = at(closes, i).sub(middle);
		sumSquaredDiff = sumSquaredDiff.add(diff.mul(diff));
	}
	const variance = sumSquaredDiff.div(Decimal.from(period));

	// sqrt via Math.sqrt (sufficient for stddev — not arbitrary precision, but
	// prediction market prices are bounded [0,1] so values are small)
	const stdDev = Decimal.from(Math.sqrt(variance.toNumber()));
	const band = stdDev.mul(Decimal.from(stdDevMultiplier));

	return {
		upper: middle.add(band),
		middle,
		lower: middle.sub(band),
	};
}
