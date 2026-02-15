import { Decimal } from "../shared/decimal.js";
import type { Candle } from "./types.js";

/**
 * Safe indexed access for Decimal arrays.
 * Callers ensure bounds via length checks before calling.
 */
export function at(arr: readonly Decimal[], i: number): Decimal {
	// biome-ignore lint/style/noNonNullAssertion: bounds validated by callers
	return arr[i]!;
}

/**
 * Safe indexed access for Candle arrays.
 * Callers ensure bounds via length checks before calling.
 */
export function atCandle(arr: readonly Candle[], i: number): Candle {
	// biome-ignore lint/style/noNonNullAssertion: bounds validated by callers
	return arr[i]!;
}

/**
 * True Range: max(H-L, |H-prevClose|, |L-prevClose|)
 * Used in ATR, ADX, and other volatility indicators.
 */
export function trueRange(candle: Candle, prevClose: Decimal): Decimal {
	const hl = candle.high.sub(candle.low);
	const hc = candle.high.sub(prevClose).abs();
	const lc = candle.low.sub(prevClose).abs();

	return Decimal.max(hl, Decimal.max(hc, lc));
}

/**
 * Maximum value in a sliding window.
 * @param arr - Array of Decimal values
 * @param start - Window start index (inclusive)
 * @param end - Window end index (inclusive)
 */
export function slidingHigh(arr: readonly Decimal[], start: number, end: number): Decimal {
	let max = at(arr, start);

	for (let i = start + 1; i <= end; i++) {
		const current = at(arr, i);
		if (current.gt(max)) {
			max = current;
		}
	}

	return max;
}

/**
 * Minimum value in a sliding window.
 * @param arr - Array of Decimal values
 * @param start - Window start index (inclusive)
 * @param end - Window end index (inclusive)
 */
export function slidingLow(arr: readonly Decimal[], start: number, end: number): Decimal {
	let min = at(arr, start);

	for (let i = start + 1; i <= end; i++) {
		const current = at(arr, i);
		if (current.lt(min)) {
			min = current;
		}
	}

	return min;
}
