import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import {
	calcAO,
	calcCCI,
	calcROC,
	calcStochRSI,
	calcStochastic,
	calcWilliamsR,
} from "./momentum-indicators.js";
import type { Candle } from "./types.js";

const d = (v: number | string) => Decimal.from(v);
const ds = (...vals: number[]) => vals.map((v) => Decimal.from(v));

const candle = (o: number, h: number, l: number, c: number, v = 100): Candle => ({
	open: d(o),
	high: d(h),
	low: d(l),
	close: d(c),
	volume: d(v),
	timestampMs: 0,
});

describe("calcStochastic", () => {
	it("computes K and D for valid data", () => {
		const candles = [
			candle(10, 12, 9, 11),
			candle(11, 13, 10, 12),
			candle(12, 14, 11, 13),
			candle(13, 15, 12, 14),
			candle(14, 16, 13, 15),
			candle(15, 17, 14, 16),
		];

		const result = calcStochastic(candles, 3, 2);
		expect(result).not.toBeNull();

		// Last 3 candles: H=[15,16,17], L=[12,13,14], Close=16
		// highestHigh = 17, lowestLow = 12
		// K = ((16 - 12) / (17 - 12)) * 100 = (4 / 5) * 100 = 80

		// Previous K (for D calculation):
		// Candles 3,4,5: H=[14,15,16], L=[11,12,13], Close=15
		// highestHigh = 16, lowestLow = 11
		// K_prev = ((15 - 11) / (16 - 11)) * 100 = (4 / 5) * 100 = 80

		// D = SMA of last 2 K values = (80 + 80) / 2 = 80

		expect(result?.k.toNumber()).toBeCloseTo(80, 5);
		expect(result?.d.toNumber()).toBeCloseTo(80, 5);
	});

	it("returns null when insufficient data", () => {
		const candles = [candle(10, 12, 9, 11), candle(11, 13, 10, 12)];
		expect(calcStochastic(candles, 3, 2)).toBeNull();
	});

	it("returns null for invalid periods", () => {
		const candles = [candle(10, 12, 9, 11), candle(11, 13, 10, 12)];
		expect(calcStochastic(candles, 0, 2)).toBeNull();
		expect(calcStochastic(candles, 3, 0)).toBeNull();
	});

	it("handles flat market (highestHigh == lowestLow)", () => {
		const candles = [
			candle(10, 10, 10, 10),
			candle(10, 10, 10, 10),
			candle(10, 10, 10, 10),
			candle(10, 10, 10, 10),
		];

		const result = calcStochastic(candles, 3, 2);
		expect(result).not.toBeNull();
		expect(result?.k.toNumber()).toBe(50);
		expect(result?.d.toNumber()).toBe(50);
	});
});

describe("calcWilliamsR", () => {
	it("computes Williams %R for valid data", () => {
		const candles = [candle(10, 12, 9, 11), candle(11, 13, 10, 10), candle(12, 14, 11, 13)];

		const result = calcWilliamsR(candles, 3);
		expect(result).not.toBeNull();

		// H=[12,13,14], L=[9,10,11], Close=13
		// highestHigh = 14, lowestLow = 9
		// %R = ((14 - 13) / (14 - 9)) * -100 = (1 / 5) * -100 = -20

		expect(result?.toNumber()).toBeCloseTo(-20, 5);
	});

	it("returns null when insufficient data", () => {
		const candles = [candle(10, 12, 9, 11)];
		expect(calcWilliamsR(candles, 3)).toBeNull();
	});

	it("returns null for invalid period", () => {
		const candles = [candle(10, 12, 9, 11)];
		expect(calcWilliamsR(candles, 0)).toBeNull();
	});

	it("handles flat market (highestHigh == lowestLow)", () => {
		const candles = [candle(10, 10, 10, 10), candle(10, 10, 10, 10), candle(10, 10, 10, 10)];

		const result = calcWilliamsR(candles, 3);
		expect(result).not.toBeNull();
		expect(result?.toNumber()).toBe(-50);
	});
});

describe("calcCCI", () => {
	it("computes CCI for valid data", () => {
		const candles = [candle(10, 12, 9, 11), candle(11, 13, 10, 12), candle(12, 14, 11, 13)];

		const result = calcCCI(candles, 3);
		expect(result).not.toBeNull();

		// TP = (H + L + C) / 3
		// TP[0] = (12 + 9 + 11) / 3 = 32/3 ≈ 10.6667
		// TP[1] = (13 + 10 + 12) / 3 = 35/3 ≈ 11.6667
		// TP[2] = (14 + 11 + 13) / 3 = 38/3 ≈ 12.6667

		// SMA(TP) = (10.6667 + 11.6667 + 12.6667) / 3 = 35/3 ≈ 11.6667

		// Mean Deviation:
		// |10.6667 - 11.6667| = 1
		// |11.6667 - 11.6667| = 0
		// |12.6667 - 11.6667| = 1
		// meanDev = (1 + 0 + 1) / 3 = 2/3 ≈ 0.6667

		// CCI = (12.6667 - 11.6667) / (0.015 * 0.6667)
		//     = 1 / 0.01 = 100

		expect(result?.toNumber()).toBeCloseTo(100, 2);
	});

	it("returns null when insufficient data", () => {
		const candles = [candle(10, 12, 9, 11)];
		expect(calcCCI(candles, 3)).toBeNull();
	});

	it("returns null for invalid period", () => {
		const candles = [candle(10, 12, 9, 11)];
		expect(calcCCI(candles, 0)).toBeNull();
	});

	it("handles flat market (meanDev == 0)", () => {
		const candles = [candle(10, 10, 10, 10), candle(10, 10, 10, 10), candle(10, 10, 10, 10)];

		const result = calcCCI(candles, 3);
		expect(result).not.toBeNull();
		expect(result?.toNumber()).toBe(0);
	});
});

describe("calcROC", () => {
	it("computes ROC for valid data", () => {
		const closes = ds(10, 12, 11, 13, 15);

		const result = calcROC(closes, 3);
		expect(result).not.toBeNull();

		// close = 15, close[n-3] = 12
		// ROC = ((15 - 12) / 12) * 100 = (3 / 12) * 100 = 25

		expect(result?.toNumber()).toBeCloseTo(25, 5);
	});

	it("returns null when insufficient data", () => {
		const closes = ds(10, 12, 11);
		expect(calcROC(closes, 3)).toBeNull();
	});

	it("returns null for invalid period", () => {
		const closes = ds(10, 12, 11, 13);
		expect(calcROC(closes, 0)).toBeNull();
	});

	it("returns null when historical close is zero", () => {
		const closes = ds(0, 12, 11, 13);
		expect(calcROC(closes, 3)).toBeNull();
	});

	it("handles negative ROC", () => {
		const closes = ds(20, 18, 16, 14, 12);

		const result = calcROC(closes, 3);
		expect(result).not.toBeNull();

		// close = 12, close[n-3] = 18
		// ROC = ((12 - 18) / 18) * 100 = (-6 / 18) * 100 ≈ -33.3333

		expect(result?.toNumber()).toBeCloseTo(-33.3333, 4);
	});
});

describe("calcAO", () => {
	it("computes AO for valid data", () => {
		const candles = [
			candle(10, 12, 8, 11),
			candle(11, 13, 9, 12),
			candle(12, 14, 10, 13),
			candle(13, 15, 11, 14),
			candle(14, 16, 12, 15),
		];

		const result = calcAO(candles, 2, 3);
		expect(result).not.toBeNull();

		// Median Price = (H + L) / 2
		// MP[0] = (12 + 8) / 2 = 10
		// MP[1] = (13 + 9) / 2 = 11
		// MP[2] = (14 + 10) / 2 = 12
		// MP[3] = (15 + 11) / 2 = 13
		// MP[4] = (16 + 12) / 2 = 14

		// SMA(MP, 2) for last 2 values = (13 + 14) / 2 = 13.5
		// SMA(MP, 3) for last 3 values = (12 + 13 + 14) / 3 = 13

		// AO = 13.5 - 13 = 0.5

		expect(result?.toNumber()).toBeCloseTo(0.5, 5);
	});

	it("returns null when insufficient data", () => {
		const candles = [candle(10, 12, 8, 11), candle(11, 13, 9, 12)];
		expect(calcAO(candles, 2, 3)).toBeNull();
	});

	it("returns null for invalid periods", () => {
		const candles = [candle(10, 12, 8, 11), candle(11, 13, 9, 12)];
		expect(calcAO(candles, 0, 3)).toBeNull();
		expect(calcAO(candles, 2, 0)).toBeNull();
	});

	it("handles flat market", () => {
		const candles = [candle(10, 10, 10, 10), candle(10, 10, 10, 10), candle(10, 10, 10, 10)];

		const result = calcAO(candles, 2, 3);
		expect(result).not.toBeNull();
		expect(result?.toNumber()).toBe(0);
	});
});

describe("calcStochRSI", () => {
	it("computes Stochastic RSI for valid data", () => {
		const closes = ds(
			44.34,
			44.09,
			44.15,
			43.61,
			44.33,
			44.83,
			45.1,
			45.42,
			45.84,
			46.08,
			45.89,
			46.03,
			45.61,
			46.28,
			46.28,
			46.0,
		);

		const result = calcStochRSI(closes, 3, 3, 2, 2);
		expect(result).not.toBeNull();
		expect(result?.k).toBeInstanceOf(Decimal);
		expect(result?.d).toBeInstanceOf(Decimal);
	});

	it("returns null when insufficient data", () => {
		const closes = ds(10, 12, 11, 13);
		expect(calcStochRSI(closes, 3, 3, 2, 2)).toBeNull();
	});

	it("returns null for invalid periods", () => {
		const closes = ds(10, 12, 11, 13, 15, 14, 16, 18, 17, 19, 20, 21);
		expect(calcStochRSI(closes, 0, 3, 2, 2)).toBeNull();
		expect(calcStochRSI(closes, 3, 0, 2, 2)).toBeNull();
		expect(calcStochRSI(closes, 3, 3, 0, 2)).toBeNull();
		expect(calcStochRSI(closes, 3, 3, 2, 0)).toBeNull();
	});

	it("handles flat RSI (max == min)", () => {
		const closes = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10].map(d);

		const result = calcStochRSI(closes, 3, 3, 2, 2);
		expect(result).not.toBeNull();
		expect(result?.k.toNumber()).toBe(50);
		expect(result?.d.toNumber()).toBe(50);
	});

	it("handles trending market with variation", () => {
		const closes = ds(10, 11, 10.5, 12, 11.5, 13, 12.5, 14, 13.5, 15, 14.5, 16, 15.5, 17);

		const result = calcStochRSI(closes, 3, 3, 2, 2);
		expect(result).not.toBeNull();
		expect(result?.k).toBeInstanceOf(Decimal);
		expect(result?.d).toBeInstanceOf(Decimal);
	});
});
