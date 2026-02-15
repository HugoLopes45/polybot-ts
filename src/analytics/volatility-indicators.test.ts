import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import type { Candle } from "./types.js";
import { calcATR, calcChandelier, calcDonchian, calcKeltner } from "./volatility-indicators.js";

const d = (v: number | string) => Decimal.from(v);

const candle = (o: number, h: number, l: number, c: number, v = 100): Candle => ({
	open: d(o),
	high: d(h),
	low: d(l),
	close: d(c),
	volume: d(v),
	timestampMs: 0,
});

describe("calcATR", () => {
	it("returns null when insufficient data", () => {
		const candles = [candle(100, 105, 95, 100)];
		expect(calcATR(candles, 14)).toBeNull();
	});

	it("returns null when period < 1", () => {
		const candles = Array.from({ length: 20 }, () => candle(100, 105, 95, 100));
		expect(calcATR(candles, 0)).toBeNull();
	});

	it("calculates ATR with known values", () => {
		const candles = [
			candle(100, 110, 95, 105),
			candle(105, 115, 100, 110),
			candle(110, 120, 105, 115),
			candle(115, 125, 110, 120),
			candle(120, 130, 115, 125),
		];

		const result = calcATR(candles, 3);
		expect(result).not.toBeNull();
		expect(result?.toNumber()).toBeCloseTo(15.0, 1);
	});

	it("handles flat market", () => {
		const candles = Array.from({ length: 20 }, () => candle(100, 100, 100, 100));
		const result = calcATR(candles, 14);
		expect(result).not.toBeNull();
		expect(result?.toNumber()).toBe(0);
	});

	it("handles gap scenarios", () => {
		const candles = [
			candle(100, 110, 95, 105),
			candle(120, 130, 115, 125),
			candle(125, 135, 120, 130),
			candle(130, 140, 125, 135),
		];

		const result = calcATR(candles, 2);
		expect(result).not.toBeNull();
		// TR values: [25 (gap), 15, 15], ATR = (25+15)/2 = 20, then smoothed with 15
		expect(result?.toNumber()).toBeCloseTo(17.5, 1);
	});
});

describe("calcDonchian", () => {
	it("returns null when insufficient data", () => {
		const candles = [candle(100, 105, 95, 100)];
		expect(calcDonchian(candles, 20)).toBeNull();
	});

	it("returns null when period < 1", () => {
		const candles = Array.from({ length: 25 }, () => candle(100, 105, 95, 100));
		expect(calcDonchian(candles, 0)).toBeNull();
	});

	it("calculates Donchian channels with known values", () => {
		const candles = [
			candle(100, 110, 90, 100),
			candle(100, 115, 95, 105),
			candle(105, 120, 100, 110),
			candle(110, 125, 105, 115),
			candle(115, 130, 110, 120),
		];

		const result = calcDonchian(candles, 5);
		expect(result).not.toBeNull();
		expect(result?.upper.toNumber()).toBe(130);
		expect(result?.lower.toNumber()).toBe(90);
		expect(result?.middle.toNumber()).toBe(110);
	});

	it("handles flat market", () => {
		const candles = Array.from({ length: 25 }, () => candle(100, 100, 100, 100));
		const result = calcDonchian(candles, 20);
		expect(result).not.toBeNull();
		expect(result?.upper.toNumber()).toBe(100);
		expect(result?.lower.toNumber()).toBe(100);
		expect(result?.middle.toNumber()).toBe(100);
	});

	it("calculates with minimum period", () => {
		const candles = [candle(100, 110, 90, 100), candle(100, 105, 95, 100)];

		const result = calcDonchian(candles, 2);
		expect(result).not.toBeNull();
		expect(result?.upper.toNumber()).toBe(110);
		expect(result?.lower.toNumber()).toBe(90);
	});
});

describe("calcKeltner", () => {
	it("returns null when insufficient data", () => {
		const candles = [candle(100, 105, 95, 100)];
		expect(calcKeltner(candles, 20, 2)).toBeNull();
	});

	it("returns null when period < 1", () => {
		const candles = Array.from({ length: 25 }, () => candle(100, 105, 95, 100));
		expect(calcKeltner(candles, 0, 2)).toBeNull();
	});

	it("calculates Keltner channels with known values", () => {
		const candles = [
			candle(100, 110, 95, 105),
			candle(105, 115, 100, 110),
			candle(110, 120, 105, 115),
			candle(115, 125, 110, 120),
			candle(120, 130, 115, 125),
		];

		const result = calcKeltner(candles, 3, 2);
		expect(result).not.toBeNull();
		expect(result?.middle.toNumber()).toBeGreaterThan(100);
		expect(result?.upper.toNumber()).toBeGreaterThan(result?.middle.toNumber());
		expect(result?.lower.toNumber()).toBeLessThan(result?.middle.toNumber());
	});

	it("handles flat market", () => {
		const candles = Array.from({ length: 25 }, () => candle(100, 100, 100, 100));
		const result = calcKeltner(candles, 20, 2);
		expect(result).not.toBeNull();
		expect(result?.middle.toNumber()).toBe(100);
		expect(result?.upper.toNumber()).toBe(100);
		expect(result?.lower.toNumber()).toBe(100);
	});

	it("respects multiplier parameter", () => {
		const candles = [
			candle(100, 110, 95, 105),
			candle(105, 115, 100, 110),
			candle(110, 120, 105, 115),
			candle(115, 125, 110, 120),
			candle(120, 130, 115, 125),
		];

		const result1 = calcKeltner(candles, 3, 1);
		const result2 = calcKeltner(candles, 3, 2);

		expect(result1).not.toBeNull();
		expect(result2).not.toBeNull();
		expect(result1?.middle.toNumber()).toBe(result2?.middle.toNumber());

		const band1 = result1?.upper.sub(result1?.middle).toNumber();
		const band2 = result2?.upper.sub(result2?.middle).toNumber();
		expect(band2).toBeCloseTo(band1 * 2, 1);
	});
});

describe("calcChandelier", () => {
	it("returns null when insufficient data", () => {
		const candles = [candle(100, 105, 95, 100)];
		expect(calcChandelier(candles, 22, 3)).toBeNull();
	});

	it("returns null when period < 1", () => {
		const candles = Array.from({ length: 25 }, () => candle(100, 105, 95, 100));
		expect(calcChandelier(candles, 0, 3)).toBeNull();
	});

	it("calculates Chandelier exits with known values", () => {
		const candles = [
			candle(100, 110, 95, 105),
			candle(105, 115, 100, 110),
			candle(110, 120, 105, 115),
			candle(115, 125, 110, 120),
			candle(120, 130, 115, 125),
		];

		const result = calcChandelier(candles, 3, 2);
		expect(result).not.toBeNull();
		expect(result?.long.toNumber()).toBeLessThan(130);
		expect(result?.short.toNumber()).toBeGreaterThan(100);
	});

	it("handles flat market", () => {
		const candles = Array.from({ length: 25 }, () => candle(100, 100, 100, 100));
		const result = calcChandelier(candles, 22, 3);
		expect(result).not.toBeNull();
		expect(result?.long.toNumber()).toBe(100);
		expect(result?.short.toNumber()).toBe(100);
	});

	it("respects multiplier parameter", () => {
		const candles = [
			candle(100, 110, 95, 105),
			candle(105, 115, 100, 110),
			candle(110, 120, 105, 115),
			candle(115, 125, 110, 120),
			candle(120, 130, 115, 125),
		];

		const result1 = calcChandelier(candles, 3, 1);
		const result2 = calcChandelier(candles, 3, 2);

		expect(result1).not.toBeNull();
		expect(result2).not.toBeNull();

		expect(result2?.long.toNumber()).toBeLessThan(result1?.long.toNumber());
		expect(result2?.short.toNumber()).toBeGreaterThan(result1?.short.toNumber());
	});
});
