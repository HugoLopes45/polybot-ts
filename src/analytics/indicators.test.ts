import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { calcBollingerBands, calcEMA, calcRSI, calcSMA } from "./indicators.js";

const d = (v: number | string) => Decimal.from(v);
const ds = (...vals: number[]) => vals.map((v) => Decimal.from(v));

describe("calcSMA", () => {
	it("calculates correct value for known series", () => {
		// [2, 4, 6, 8, 10] period=5 → (2+4+6+8+10)/5 = 6
		const result = calcSMA(ds(2, 4, 6, 8, 10), 5);
		expect(result?.toString()).toBe("6");
	});

	it("uses last N values when array is longer than period", () => {
		// [1, 2, 3, 4, 5, 6] period=3 → (4+5+6)/3 = 5
		const result = calcSMA(ds(1, 2, 3, 4, 5, 6), 3);
		expect(result?.toString()).toBe("5");
	});

	it("returns null when insufficient data", () => {
		expect(calcSMA(ds(1, 2), 5)).toBeNull();
	});

	it("returns null when period < 1", () => {
		expect(calcSMA(ds(1, 2, 3), 0)).toBeNull();
		expect(calcSMA(ds(1, 2, 3), -1)).toBeNull();
	});

	it("handles period=1 (returns last value)", () => {
		expect(calcSMA(ds(10, 20, 30), 1)?.toString()).toBe("30");
	});

	it("preserves Decimal precision", () => {
		// [1, 2, 3] period=3 → 6/3 = 2 exactly
		const result = calcSMA(ds(1, 2, 3), 3);
		expect(result?.toString()).toBe("2");
	});
});

describe("calcEMA", () => {
	it("calculates correct value for known series", () => {
		// Period=3, multiplier = 2/(3+1) = 0.5
		// Closes: [2, 4, 6, 8, 10]
		// Seed SMA(first 3) = (2+4+6)/3 = 4
		// EMA after 8: 8*0.5 + 4*0.5 = 6
		// EMA after 10: 10*0.5 + 6*0.5 = 8
		const result = calcEMA(ds(2, 4, 6, 8, 10), 3);
		expect(result?.toString()).toBe("8");
	});

	it("returns null when insufficient data", () => {
		expect(calcEMA(ds(1, 2), 5)).toBeNull();
	});

	it("returns null when period < 1", () => {
		expect(calcEMA(ds(1, 2, 3), 0)).toBeNull();
	});

	it("period=1 returns last value", () => {
		// multiplier = 2/(1+1) = 1, so EMA = close * 1 + prev * 0 = close
		const result = calcEMA(ds(10, 20, 30), 1);
		expect(result?.toString()).toBe("30");
	});

	it("with exactly period values, returns SMA (no smoothing steps)", () => {
		// [2, 4, 6] period=3 → SMA = 4, no further values → EMA = 4
		const result = calcEMA(ds(2, 4, 6), 3);
		expect(result?.toString()).toBe("4");
	});
});

describe("calcRSI", () => {
	it("returns 100 for all gains (overbought)", () => {
		// Monotonically increasing: all changes are gains, avgLoss = 0
		const closes = ds(10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24);
		const result = calcRSI(closes, 14);
		expect(result?.toString()).toBe("100");
	});

	it("returns 0 for all losses (oversold)", () => {
		// Monotonically decreasing: all changes are losses, avgGain = 0
		const closes = ds(24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10);
		const result = calcRSI(closes, 14);
		expect(result?.toString()).toBe("0");
	});

	it("calculates correct value for mixed series", () => {
		// Simple 4-period RSI to verify by hand
		// Closes: [44, 44.34, 44.09, 43.61, 44.33]
		// Changes: +0.34, -0.25, -0.48, +0.72
		// First avgGain = (0.34+0.72)/4 = 0.265
		// First avgLoss = (0.25+0.48)/4 = 0.1825
		// RS = 0.265 / 0.1825 ≈ 1.4521
		// RSI = 100 - 100/(1+1.4521) ≈ 59.21
		const closes = [d("44"), d("44.34"), d("44.09"), d("43.61"), d("44.33")];
		const result = calcRSI(closes, 4);
		expect(result).not.toBeNull();
		expect(result?.toNumber()).toBeCloseTo(59.21, 0);
	});

	it("returns null when insufficient data", () => {
		// Need period+1 values minimum
		expect(calcRSI(ds(1, 2, 3), 14)).toBeNull();
		expect(calcRSI(ds(1, 2, 3, 4, 5), 5)).toBeNull(); // exactly period+0, need period+1
	});

	it("returns null when period < 1", () => {
		expect(calcRSI(ds(1, 2, 3), 0)).toBeNull();
	});

	it("default period is 14", () => {
		// 16 values (15 changes, > 14 needed)
		const closes = ds(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
		const result = calcRSI(closes);
		expect(result).not.toBeNull();
		expect(result?.toString()).toBe("100"); // all gains
	});
});

describe("calcBollingerBands", () => {
	it("calculates correct values for known series", () => {
		// [2, 4, 6, 8, 10] period=5, multiplier=2
		// SMA = 6
		// Variance = ((2-6)^2 + (4-6)^2 + (6-6)^2 + (8-6)^2 + (10-6)^2) / 5
		//          = (16 + 4 + 0 + 4 + 16) / 5 = 8
		// StdDev = sqrt(8) ≈ 2.8284
		// Upper = 6 + 2*2.8284 ≈ 11.6569
		// Lower = 6 - 2*2.8284 ≈ 0.3431
		const result = calcBollingerBands(ds(2, 4, 6, 8, 10), 5, 2);
		expect(result).not.toBeNull();
		expect(result?.middle.toString()).toBe("6");
		expect(result?.upper.toNumber()).toBeCloseTo(11.6569, 2);
		expect(result?.lower.toNumber()).toBeCloseTo(0.3431, 2);
	});

	it("returns null when insufficient data", () => {
		expect(calcBollingerBands(ds(1, 2, 3), 5)).toBeNull();
	});

	it("returns null when period < 1", () => {
		expect(calcBollingerBands(ds(1, 2, 3), 0)).toBeNull();
	});

	it("default period=20, stdDevMultiplier=2", () => {
		// 19 values → null (need 20)
		const short = Array.from({ length: 19 }, (_, i) => d(i + 1));
		expect(calcBollingerBands(short)).toBeNull();

		// 20 values → not null
		const enough = Array.from({ length: 20 }, (_, i) => d(i + 1));
		expect(calcBollingerBands(enough)).not.toBeNull();
	});

	it("bands collapse when all values are equal", () => {
		const result = calcBollingerBands(ds(5, 5, 5, 5, 5), 5, 2);
		expect(result).not.toBeNull();
		expect(result?.middle.toString()).toBe("5");
		expect(result?.upper.toString()).toBe("5");
		expect(result?.lower.toString()).toBe("5");
	});
});
