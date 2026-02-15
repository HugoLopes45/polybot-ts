import { Decimal } from "../shared/decimal.js";
import { ErrorCategory, TradingError } from "../shared/errors.js";
import { type Result, err, ok } from "../shared/result.js";

/** Supported candlestick time intervals. */
export type Interval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

/** OHLCV candlestick with all values as Decimal for financial precision. */
export interface Candle {
	readonly open: Decimal;
	readonly high: Decimal;
	readonly low: Decimal;
	readonly close: Decimal;
	readonly volume: Decimal;
	readonly timestampMs: number;
}

/** Milliseconds per interval for bucket alignment. */
export const INTERVAL_MS: Record<Interval, number> = {
	"1m": 60_000,
	"5m": 300_000,
	"15m": 900_000,
	"1h": 3_600_000,
	"4h": 14_400_000,
	"1d": 86_400_000,
};

/** Band indicator result (upper, middle, lower). */
export interface BandResult {
	readonly upper: Decimal;
	readonly middle: Decimal;
	readonly lower: Decimal;
}

/** MACD indicator result (macd, signal, histogram). */
export interface MACDResult {
	readonly macd: Decimal;
	readonly signal: Decimal;
	readonly histogram: Decimal;
}

/** Stochastic indicator result (k, d). */
export interface StochasticResult {
	readonly k: Decimal;
	readonly d: Decimal;
}

/**
 * Creates a validated Candle object.
 * Validates: volume >= 0, timestampMs >= 0, high >= max(open, close), low <= min(open, close).
 * @param input - Candle field values
 * @returns Ok with Candle, or Err with validation error
 */
export function createCandle(input: {
	open: Decimal;
	high: Decimal;
	low: Decimal;
	close: Decimal;
	volume: Decimal;
	timestampMs: number;
}): Result<Candle, TradingError> {
	const { open, high, low, close, volume, timestampMs } = input;

	if (volume.isNegative()) {
		return err(
			new TradingError("Candle volume must be >= 0", "INVALID_CANDLE", ErrorCategory.NonRetryable, {
				volume: volume.toString(),
			}),
		);
	}

	if (timestampMs < 0) {
		return err(
			new TradingError(
				"Candle timestampMs must be >= 0",
				"INVALID_CANDLE",
				ErrorCategory.NonRetryable,
				{ timestampMs },
			),
		);
	}

	const maxPrice = Decimal.max(open, close);
	if (high.lt(maxPrice)) {
		return err(
			new TradingError(
				"Candle high must be >= max(open, close)",
				"INVALID_CANDLE",
				ErrorCategory.NonRetryable,
				{
					high: high.toString(),
					open: open.toString(),
					close: close.toString(),
				},
			),
		);
	}

	if (high.lt(low)) {
		return err(
			new TradingError("Candle high must be >= low", "INVALID_CANDLE", ErrorCategory.NonRetryable, {
				high: high.toString(),
				low: low.toString(),
			}),
		);
	}

	const minPrice = Decimal.min(open, close);
	if (low.gt(minPrice)) {
		return err(
			new TradingError(
				"Candle low must be <= min(open, close)",
				"INVALID_CANDLE",
				ErrorCategory.NonRetryable,
				{
					low: low.toString(),
					open: open.toString(),
					close: close.toString(),
				},
			),
		);
	}

	return ok({ open, high, low, close, volume, timestampMs });
}
