import type { Decimal } from "../shared/decimal.js";

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
