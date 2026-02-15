import { Decimal } from "../shared/decimal.js";
import type { Candle, Interval } from "./types.js";
import { INTERVAL_MS } from "./types.js";

interface MutableCandle {
	open: Decimal;
	high: Decimal;
	low: Decimal;
	close: Decimal;
	volume: Decimal;
	timestampMs: number;
}

const ALL_INTERVALS: readonly Interval[] = ["1m", "5m", "15m", "1h", "4h", "1d"];

/**
 * Aggregates raw trades into OHLCV candlesticks across all supported intervals.
 *
 * Uses sparse storage — only intervals with actual trades produce candles.
 */
export class KLineAggregator {
	private readonly candles: Map<Interval, Map<number, MutableCandle>>;

	constructor() {
		this.candles = new Map();
		for (const interval of ALL_INTERVALS) {
			this.candles.set(interval, new Map());
		}
	}

	addTrade(price: Decimal, size: Decimal, timestampMs: number): void {
		for (const interval of ALL_INTERVALS) {
			const intervalMs = INTERVAL_MS[interval];
			const bucketStart = Math.floor(timestampMs / intervalMs) * intervalMs;
			const bucketMap = this.candles.get(interval);
			if (!bucketMap) continue;

			const existing = bucketMap.get(bucketStart);
			if (existing) {
				existing.high = Decimal.max(existing.high, price);
				existing.low = Decimal.min(existing.low, price);
				existing.close = price;
				existing.volume = existing.volume.add(size);
			} else {
				bucketMap.set(bucketStart, {
					open: price,
					high: price,
					low: price,
					close: price,
					volume: size,
					timestampMs: bucketStart,
				});
			}
		}
	}

	/**
	 * Returns the most recent candles for the given interval.
	 * @param interval - The time interval to query
	 * @param count - Maximum number of candles to return
	 * @returns Candles in reverse-chronological order (most recent first)
	 * @warning Results are sorted most recent first. Use `getCandlesChronological()` for oldest-first order.
	 */
	getCandles(interval: Interval, count: number): readonly Candle[] {
		const bucketMap = this.candles.get(interval);
		if (!bucketMap || bucketMap.size === 0) return [];

		const sorted = [...bucketMap.values()].sort((a, b) => b.timestampMs - a.timestampMs);

		return sorted.slice(0, count).map((c) => ({
			open: c.open,
			high: c.high,
			low: c.low,
			close: c.close,
			volume: c.volume,
			timestampMs: c.timestampMs,
		}));
	}

	/**
	 * Returns the most recent candles in chronological order (oldest first).
	 * This is the order expected by indicator functions.
	 * @param interval - The time interval to query
	 * @param count - Maximum number of candles to return
	 * @returns Candles in chronological order (oldest first)
	 */
	getCandlesChronological(interval: Interval, count?: number): readonly Candle[] {
		const candles = this.getCandles(interval, count ?? Number.POSITIVE_INFINITY);
		return [...candles].reverse();
	}
}
