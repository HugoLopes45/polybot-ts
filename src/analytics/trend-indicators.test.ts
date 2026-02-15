import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { calcADX, calcAroon, calcDEMA, calcMACD, calcPSAR, calcTRIX } from "./trend-indicators.js";
import type { Candle } from "./types.js";

const d = (v: number | string) => Decimal.from(v);

const candle = (o: number, h: number, l: number, c: number, v = 100): Candle => ({
	open: d(o),
	high: d(h),
	low: d(l),
	close: d(c),
	volume: d(v),
	timestampMs: 0,
});

describe("calcMACD", () => {
	it("returns null when insufficient data", () => {
		const candles = [candle(100, 105, 95, 100)];
		expect(calcMACD(candles, 12, 26, 9)).toBeNull();
	});

	it("returns null when period < 1", () => {
		const candles = Array.from({ length: 30 }, () => candle(100, 105, 95, 100));
		expect(calcMACD(candles, 0, 26, 9)).toBeNull();
		expect(calcMACD(candles, 12, 0, 9)).toBeNull();
		expect(calcMACD(candles, 12, 26, 0)).toBeNull();
	});

	it("calculates MACD with known values", () => {
		const closes = [100, 102, 104, 103, 105, 107, 106, 108, 110, 109];
		const candles = closes.map((c) => candle(c, c + 5, c - 5, c));

		const result = calcMACD(candles, 3, 5, 3);
		expect(result).not.toBeNull();
		expect(result?.macd.toNumber()).toBeGreaterThan(0);
		expect(result?.signal.toNumber()).toBeGreaterThan(0);
	});

	it("handles flat market", () => {
		const candles = Array.from({ length: 50 }, () => candle(100, 100, 100, 100));
		const result = calcMACD(candles, 12, 26, 9);
		expect(result).not.toBeNull();
		expect(result?.macd.toNumber()).toBe(0);
		expect(result?.signal.toNumber()).toBe(0);
		expect(result?.histogram.toNumber()).toBe(0);
	});

	it("calculates histogram as difference", () => {
		const closes = [100, 105, 110, 115, 120, 125, 130, 135, 140, 145];
		const candles = closes.map((c) => candle(c, c + 5, c - 5, c));

		const result = calcMACD(candles, 3, 5, 3);
		expect(result).not.toBeNull();

		const expectedHistogram = result?.macd.sub(result?.signal);
		expect(result?.histogram.toNumber()).toBeCloseTo(expectedHistogram.toNumber(), 5);
	});
});

describe("calcADX", () => {
	it("returns null when insufficient data", () => {
		const candles = [candle(100, 105, 95, 100)];
		expect(calcADX(candles, 14)).toBeNull();
	});

	it("returns null when period < 1", () => {
		const candles = Array.from({ length: 30 }, () => candle(100, 105, 95, 100));
		expect(calcADX(candles, 0)).toBeNull();
	});

	it("calculates ADX with known values", () => {
		const candles = [
			candle(100, 110, 95, 105),
			candle(105, 115, 100, 110),
			candle(110, 120, 105, 115),
			candle(115, 125, 110, 120),
			candle(120, 130, 115, 125),
			candle(125, 135, 120, 130),
			candle(130, 140, 125, 135),
			candle(135, 145, 130, 140),
			candle(140, 150, 135, 145),
			candle(145, 155, 140, 150),
		];

		const result = calcADX(candles, 3);
		expect(result).not.toBeNull();
		expect(result?.adx.toNumber()).toBeGreaterThan(0);
		expect(result?.plusDI.toNumber()).toBeGreaterThan(0);
		expect(result?.minusDI.toNumber()).toBeGreaterThanOrEqual(0);
	});

	it("handles flat market", () => {
		const candles = Array.from({ length: 30 }, () => candle(100, 100, 100, 100));
		const result = calcADX(candles, 14);
		expect(result).toBeNull();
	});

	it("detects strong uptrend", () => {
		const candles = Array.from({ length: 30 }, (_, i) => {
			const base = 100 + i * 5;
			return candle(base, base + 10, base, base + 5);
		});

		const result = calcADX(candles, 14);
		expect(result).not.toBeNull();
		expect(result?.plusDI.toNumber()).toBeGreaterThan(result?.minusDI.toNumber());
	});
});

describe("calcAroon", () => {
	it("returns null when insufficient data", () => {
		const candles = [candle(100, 105, 95, 100)];
		expect(calcAroon(candles, 25)).toBeNull();
	});

	it("returns null when period < 1", () => {
		const candles = Array.from({ length: 30 }, () => candle(100, 105, 95, 100));
		expect(calcAroon(candles, 0)).toBeNull();
	});

	it("calculates Aroon with known values", () => {
		const candles = [
			candle(100, 110, 95, 105),
			candle(105, 115, 100, 110),
			candle(110, 120, 105, 115),
			candle(115, 125, 110, 120),
			candle(120, 130, 115, 125),
			candle(125, 135, 120, 130),
		];

		const result = calcAroon(candles, 5);
		expect(result).not.toBeNull();
		expect(result?.up.toNumber()).toBe(100);
		expect(result?.down.toNumber()).toBe(0);
	});

	it("handles flat market", () => {
		const candles = Array.from({ length: 30 }, () => candle(100, 100, 100, 100));
		const result = calcAroon(candles, 25);
		expect(result).not.toBeNull();
		expect(result?.up.toNumber()).toBe(100);
		expect(result?.down.toNumber()).toBe(100);
	});

	it("detects recent high and low", () => {
		const candles = [
			candle(100, 150, 50, 100),
			candle(100, 110, 90, 100),
			candle(100, 110, 90, 100),
			candle(100, 110, 90, 100),
			candle(100, 110, 90, 100),
			candle(100, 110, 90, 100),
		];

		const result = calcAroon(candles, 5);
		expect(result).not.toBeNull();
		expect(result?.up.toNumber()).toBe(0);
		expect(result?.down.toNumber()).toBe(0);
	});
});

describe("calcDEMA", () => {
	it("returns null when insufficient data", () => {
		const closes = [d(100)];
		expect(calcDEMA(closes, 12)).toBeNull();
	});

	it("returns null when period < 1", () => {
		const closes = Array.from({ length: 30 }, () => d(100));
		expect(calcDEMA(closes, 0)).toBeNull();
	});

	it("calculates DEMA with known values", () => {
		const closes = [100, 102, 104, 103, 105, 107, 106, 108, 110, 109, 111, 113, 115].map(d);
		const result = calcDEMA(closes, 5);
		expect(result).not.toBeNull();
		expect(result?.toNumber()).toBeGreaterThan(100);
	});

	it("handles flat market", () => {
		const closes = Array.from({ length: 30 }, () => d(100));
		const result = calcDEMA(closes, 12);
		expect(result).not.toBeNull();
		expect(result?.toNumber()).toBe(100);
	});

	it("responds faster than EMA", () => {
		const closes = [100, 100, 100, 100, 100, 110, 110, 110, 110, 110, 110, 110].map(d);
		const result = calcDEMA(closes, 5);
		expect(result).not.toBeNull();
		expect(result?.toNumber()).toBeGreaterThan(105);
	});
});

describe("calcTRIX", () => {
	it("returns null when insufficient data", () => {
		const closes = [d(100)];
		expect(calcTRIX(closes, 4)).toBeNull();
	});

	it("returns null when period < 1", () => {
		const closes = Array.from({ length: 30 }, () => d(100));
		expect(calcTRIX(closes, 0)).toBeNull();
	});

	it("calculates TRIX with known values", () => {
		const closes = Array.from({ length: 20 }, (_, i) => d(100 + i));
		const result = calcTRIX(closes, 4);
		expect(result).not.toBeNull();
		expect(result?.toNumber()).toBeGreaterThan(0);
	});

	it("handles flat market", () => {
		const closes = Array.from({ length: 30 }, () => d(100));
		const result = calcTRIX(closes, 4);
		expect(result).not.toBeNull();
		expect(result?.toNumber()).toBe(0);
	});

	it("detects rate of change", () => {
		const closes = [100, 105, 110, 115, 120, 125, 130, 135, 140, 145, 150, 155, 160].map(d);
		const result = calcTRIX(closes, 4);
		expect(result).not.toBeNull();
		expect(result?.toNumber()).toBeGreaterThan(0);
	});
});

describe("calcPSAR", () => {
	it("returns null when insufficient data", () => {
		const candles = [candle(100, 105, 95, 100)];
		expect(calcPSAR(candles, 0.02, 0.2)).toBeNull();
	});

	it("calculates PSAR with known values", () => {
		const candles = [
			candle(100, 110, 95, 105),
			candle(105, 115, 100, 110),
			candle(110, 120, 105, 115),
			candle(115, 125, 110, 120),
			candle(120, 130, 115, 125),
		];

		const result = calcPSAR(candles, 0.02, 0.2);
		expect(result).not.toBeNull();
		expect(result?.length).toBe(5);
		expect(result?.[0]?.toNumber()).toBe(95);
	});

	it("handles flat market", () => {
		const candles = Array.from({ length: 10 }, () => candle(100, 100, 100, 100));
		const result = calcPSAR(candles, 0.02, 0.2);
		expect(result).not.toBeNull();
		expect(result?.length).toBe(10);
	});

	it("follows trend direction", () => {
		const candles = Array.from({ length: 10 }, (_, i) => {
			const base = 100 + i * 5;
			return candle(base, base + 5, base, base + 3);
		});

		const result = calcPSAR(candles, 0.02, 0.2);
		expect(result).not.toBeNull();
		expect(result?.length).toBe(10);

		for (let i = 1; i < (result?.length ?? 0); i++) {
			const sar = result?.[i];
			const candleClose = candles[i]?.close;
			expect(sar?.toNumber()).toBeLessThan(candleClose?.toNumber() ?? 0);
		}
	});
});
