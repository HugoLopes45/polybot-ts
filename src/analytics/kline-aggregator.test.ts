import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { KLineAggregator } from "./kline-aggregator.js";
import { INTERVAL_MS } from "./types.js";

describe("KLineAggregator", () => {
	function setup() {
		const agg = new KLineAggregator();
		return { agg };
	}

	describe("addTrade + getCandles basics", () => {
		it("creates a candle for the current interval", () => {
			const { agg } = setup();
			agg.addTrade(Decimal.from("0.50"), Decimal.from("100"), 1000);

			const candles = agg.getCandles("1m", 10);
			expect(candles).toHaveLength(1);
			expect(candles[0]?.open.toString()).toBe("0.5");
			expect(candles[0]?.close.toString()).toBe("0.5");
		});

		it("returns empty array when no trades", () => {
			const { agg } = setup();
			expect(agg.getCandles("1m", 10)).toEqual([]);
		});

		it("limits returned candle count", () => {
			const { agg } = setup();
			// 3 candles across 3 different 1m intervals
			agg.addTrade(Decimal.from("0.50"), Decimal.from("10"), 0);
			agg.addTrade(Decimal.from("0.51"), Decimal.from("10"), 60_000);
			agg.addTrade(Decimal.from("0.52"), Decimal.from("10"), 120_000);

			const candles = agg.getCandles("1m", 2);
			expect(candles).toHaveLength(2);
		});
	});

	describe("OHLCV values", () => {
		it("first trade sets open/high/low/close", () => {
			const { agg } = setup();
			agg.addTrade(Decimal.from("0.55"), Decimal.from("50"), 1000);

			const candles = agg.getCandles("1m", 10);
			const c = candles[0];
			expect(c?.open.toString()).toBe("0.55");
			expect(c?.high.toString()).toBe("0.55");
			expect(c?.low.toString()).toBe("0.55");
			expect(c?.close.toString()).toBe("0.55");
		});

		it("subsequent trades update high/low/close correctly", () => {
			const { agg } = setup();
			// Same 1m interval (all within 0-59999ms)
			agg.addTrade(Decimal.from("0.50"), Decimal.from("10"), 1000);
			agg.addTrade(Decimal.from("0.60"), Decimal.from("10"), 2000);
			agg.addTrade(Decimal.from("0.40"), Decimal.from("10"), 3000);
			agg.addTrade(Decimal.from("0.55"), Decimal.from("10"), 4000);

			const candles = agg.getCandles("1m", 10);
			const c = candles[0];
			expect(c?.open.toString()).toBe("0.5");
			expect(c?.high.toString()).toBe("0.6");
			expect(c?.low.toString()).toBe("0.4");
			expect(c?.close.toString()).toBe("0.55");
		});
	});

	describe("volume aggregation", () => {
		it("sums trade sizes within an interval", () => {
			const { agg } = setup();
			agg.addTrade(Decimal.from("0.50"), Decimal.from("100"), 1000);
			agg.addTrade(Decimal.from("0.51"), Decimal.from("200"), 2000);
			agg.addTrade(Decimal.from("0.49"), Decimal.from("50"), 3000);

			const candles = agg.getCandles("1m", 10);
			expect(candles[0]?.volume.toString()).toBe("350");
		});
	});

	describe("interval boundaries", () => {
		it("trade at boundary starts a new candle", () => {
			const { agg } = setup();
			const intervalMs = INTERVAL_MS["1m"]; // 60_000
			agg.addTrade(Decimal.from("0.50"), Decimal.from("10"), intervalMs - 1);
			agg.addTrade(Decimal.from("0.55"), Decimal.from("20"), intervalMs);

			const candles = agg.getCandles("1m", 10);
			expect(candles).toHaveLength(2);
		});

		it("trades across different intervals create separate candles", () => {
			const { agg } = setup();
			agg.addTrade(Decimal.from("0.50"), Decimal.from("10"), 0);
			agg.addTrade(Decimal.from("0.51"), Decimal.from("10"), 60_000);
			agg.addTrade(Decimal.from("0.52"), Decimal.from("10"), 120_000);

			const candles = agg.getCandles("1m", 10);
			expect(candles).toHaveLength(3);
			// Most recent first
			expect(candles[0]?.close.toString()).toBe("0.52");
			expect(candles[1]?.close.toString()).toBe("0.51");
			expect(candles[2]?.close.toString()).toBe("0.5");
		});
	});

	describe("gap handling", () => {
		it("intervals with no trades are NOT created (sparse)", () => {
			const { agg } = setup();
			agg.addTrade(Decimal.from("0.50"), Decimal.from("10"), 0);
			// Skip 1m interval at 60_000
			agg.addTrade(Decimal.from("0.55"), Decimal.from("10"), 120_000);

			const candles = agg.getCandles("1m", 10);
			expect(candles).toHaveLength(2);
			// No phantom candle for 60_000-119_999
		});
	});

	describe("multi-interval tracking", () => {
		it("same trade appears in multiple interval buckets", () => {
			const { agg } = setup();
			agg.addTrade(Decimal.from("0.50"), Decimal.from("100"), 1000);

			expect(agg.getCandles("1m", 10)).toHaveLength(1);
			expect(agg.getCandles("5m", 10)).toHaveLength(1);
			expect(agg.getCandles("1h", 10)).toHaveLength(1);
		});

		it("1h candle aggregates all trades within the hour", () => {
			const { agg } = setup();
			// Trades at different minutes within the same hour
			agg.addTrade(Decimal.from("0.50"), Decimal.from("10"), 0);
			agg.addTrade(Decimal.from("0.60"), Decimal.from("20"), 60_000);
			agg.addTrade(Decimal.from("0.40"), Decimal.from("30"), 120_000);

			const hourCandles = agg.getCandles("1h", 10);
			expect(hourCandles).toHaveLength(1);
			expect(hourCandles[0]?.open.toString()).toBe("0.5");
			expect(hourCandles[0]?.high.toString()).toBe("0.6");
			expect(hourCandles[0]?.low.toString()).toBe("0.4");
			expect(hourCandles[0]?.close.toString()).toBe("0.4");
			expect(hourCandles[0]?.volume.toString()).toBe("60");
		});
	});

	describe("candle ordering", () => {
		it("getCandles returns most recent first", () => {
			const { agg } = setup();
			agg.addTrade(Decimal.from("0.50"), Decimal.from("10"), 0);
			agg.addTrade(Decimal.from("0.55"), Decimal.from("10"), 60_000);
			agg.addTrade(Decimal.from("0.60"), Decimal.from("10"), 120_000);

			const candles = agg.getCandles("1m", 10);
			expect(candles[0]?.timestampMs).toBe(120_000);
			expect(candles[1]?.timestampMs).toBe(60_000);
			expect(candles[2]?.timestampMs).toBe(0);
		});
	});

	describe("getCandlesChronological", () => {
		it("returns candles in oldest-first order", () => {
			const { agg } = setup();
			agg.addTrade(Decimal.from("0.50"), Decimal.from("10"), 0);
			agg.addTrade(Decimal.from("0.55"), Decimal.from("10"), 60_000);
			agg.addTrade(Decimal.from("0.60"), Decimal.from("10"), 120_000);

			const candles = agg.getCandlesChronological("1m");
			expect(candles).toHaveLength(3);
			expect(candles[0]?.timestampMs).toBe(0);
			expect(candles[1]?.timestampMs).toBe(60_000);
			expect(candles[2]?.timestampMs).toBe(120_000);
		});

		it("returns empty array when no trades", () => {
			const { agg } = setup();
			expect(agg.getCandlesChronological("1m")).toEqual([]);
		});

		it("limits returned candle count", () => {
			const { agg } = setup();
			agg.addTrade(Decimal.from("0.50"), Decimal.from("10"), 0);
			agg.addTrade(Decimal.from("0.51"), Decimal.from("10"), 60_000);
			agg.addTrade(Decimal.from("0.52"), Decimal.from("10"), 120_000);

			const candles = agg.getCandlesChronological("1m", 2);
			expect(candles).toHaveLength(2);
			// Most recent 2, in chronological order
			expect(candles[0]?.close.toString()).toBe("0.51");
			expect(candles[1]?.close.toString()).toBe("0.52");
		});

		it("returns all candles when count omitted", () => {
			const { agg } = setup();
			agg.addTrade(Decimal.from("0.50"), Decimal.from("10"), 0);
			agg.addTrade(Decimal.from("0.51"), Decimal.from("10"), 60_000);

			const candles = agg.getCandlesChronological("1m");
			expect(candles).toHaveLength(2);
		});
	});

	describe("timestamp alignment", () => {
		it("candle timestampMs is aligned to interval start", () => {
			const { agg } = setup();
			agg.addTrade(Decimal.from("0.50"), Decimal.from("10"), 12345);

			const candles = agg.getCandles("1m", 10);
			// 12345 floored to 1m = 0
			expect(candles[0]?.timestampMs).toBe(0);
		});

		it("5m candle aligns to 5-minute boundary", () => {
			const { agg } = setup();
			agg.addTrade(Decimal.from("0.50"), Decimal.from("10"), 360_000); // 6 minutes

			const candles = agg.getCandles("5m", 10);
			// 360_000 floored to 5m = 300_000
			expect(candles[0]?.timestampMs).toBe(300_000);
		});
	});
});
