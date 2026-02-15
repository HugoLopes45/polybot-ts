import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import type { Candle } from "./types.js";
import {
	calcADL,
	calcCMF,
	calcForceIndex,
	calcMFI,
	calcNVI,
	calcOBV,
	calcPVO,
	calcVPT,
	calcVWMA,
} from "./volume-indicators.js";

const d = (v: number | string) => Decimal.from(v);

const candle = (o: number, h: number, l: number, c: number, v = 100): Candle => ({
	open: d(o),
	high: d(h),
	low: d(l),
	close: d(c),
	volume: d(v),
	timestampMs: 0,
});

describe("calcOBV", () => {
	it("should return null for less than 2 candles", () => {
		expect(calcOBV([])).toBeNull();
		expect(calcOBV([candle(100, 101, 99, 100)])).toBeNull();
	});

	it("should calculate OBV correctly for up/down/flat pattern", () => {
		const candles = [
			candle(100, 101, 99, 100, 1000), // base
			candle(100, 102, 100, 101, 1200), // up: OBV = +1200
			candle(101, 102, 99, 99, 800), // down: OBV = 1200 - 800 = 400
			candle(99, 100, 98, 99, 500), // flat: OBV = 400
			candle(99, 101, 99, 102, 1500), // up: OBV = 400 + 1500 = 1900
		];
		const result = calcOBV(candles);
		expect(result).not.toBeNull();
		expect(result?.toString()).toBe("1900");
	});
});

describe("calcVWMA", () => {
	it("should return null for period < 1", () => {
		expect(calcVWMA([candle(100, 101, 99, 100), candle(101, 102, 100, 101)], 0)).toBeNull();
	});

	it("should return null for insufficient data", () => {
		expect(calcVWMA([], 3)).toBeNull();
		expect(calcVWMA([candle(100, 101, 99, 100)], 3)).toBeNull();
		expect(calcVWMA([candle(100, 101, 99, 100), candle(101, 102, 100, 101)], 3)).toBeNull();
	});

	it("should return null when volume sum is zero", () => {
		const candles = [
			candle(100, 101, 99, 100, 0),
			candle(101, 102, 100, 101, 0),
			candle(102, 103, 101, 102, 0),
		];
		expect(calcVWMA(candles, 3)).toBeNull();
	});

	it("should calculate VWMA correctly", () => {
		const candles = [
			candle(100, 101, 99, 100, 10),
			candle(101, 102, 100, 102, 20),
			candle(102, 103, 101, 104, 30),
			candle(104, 105, 103, 106, 40),
			candle(106, 107, 105, 108, 50),
		];
		// Last 3 candles: close=[104,106,108], volume=[30,40,50]
		// VWMA = (104*30 + 106*40 + 108*50) / (30+40+50)
		//      = (3120 + 4240 + 5400) / 120 = 12760 / 120 = 106.333...
		const result = calcVWMA(candles, 3);
		expect(result).not.toBeNull();
		expect(result?.toNumber()).toBeCloseTo(106.333333, 5);
	});
});

describe("calcMFI", () => {
	it("should return null for period < 1", () => {
		expect(
			calcMFI(
				[candle(100, 101, 99, 100), candle(101, 102, 100, 101), candle(102, 103, 101, 102)],
				0,
			),
		).toBeNull();
	});

	it("should return null for insufficient data", () => {
		expect(calcMFI([], 3)).toBeNull();
		expect(calcMFI([candle(100, 101, 99, 100)], 3)).toBeNull();
		expect(calcMFI([candle(100, 101, 99, 100), candle(101, 102, 100, 101)], 3)).toBeNull();
		expect(
			calcMFI(
				[candle(100, 101, 99, 100), candle(101, 102, 100, 101), candle(102, 103, 101, 102)],
				3,
			),
		).toBeNull();
	});

	it("should return 100 when negative money flow is zero", () => {
		// All increasing typical prices
		const candles = [
			candle(90, 92, 88, 90, 100), // TP = 90
			candle(91, 93, 89, 92, 100), // TP = 91.333 (up)
			candle(93, 95, 91, 94, 100), // TP = 93.333 (up)
			candle(95, 97, 93, 96, 100), // TP = 95.333 (up)
		];
		const result = calcMFI(candles, 3);
		expect(result).not.toBeNull();
		expect(result?.toNumber()).toBe(100);
	});

	it("should return 0 when positive money flow is zero", () => {
		// All decreasing typical prices
		const candles = [
			candle(100, 102, 98, 100, 100), // TP = 100
			candle(99, 101, 97, 98, 100), // TP = 98.667 (down)
			candle(97, 99, 95, 96, 100), // TP = 96.667 (down)
			candle(95, 97, 93, 94, 100), // TP = 94.667 (down)
		];
		const result = calcMFI(candles, 3);
		expect(result).not.toBeNull();
		expect(result?.toNumber()).toBe(0);
	});

	it("should calculate MFI correctly for mixed money flow", () => {
		const candles = [
			candle(100, 102, 98, 100, 1000), // TP = 100
			candle(101, 103, 99, 102, 1200), // TP = 101.333 (up), posMF = 121600
			candle(101, 103, 99, 99, 800), // TP = 100.333 (down), negMF = 80266.667
			candle(99, 101, 97, 98, 1000), // TP = 98.667 (down), negMF += 98666.667
		];
		// Period=3, last 3 changes:
		// Positive MF sum = 121600
		// Negative MF sum = 80266.667 + 98666.667 = 178933.333
		// MFR = 121600 / 178933.333 = 0.679577...
		// MFI = 100 - 100/(1+0.679577) = 100 - 59.538... = 40.461...
		const result = calcMFI(candles, 3);
		expect(result).not.toBeNull();
		expect(result?.toNumber()).toBeCloseTo(40.46, 1);
	});
});

describe("calcADL", () => {
	it("should return null for empty array", () => {
		expect(calcADL([])).toBeNull();
	});

	it("should calculate ADL correctly", () => {
		const candles = [
			candle(100, 110, 90, 105, 1000), // CLV = ((105-90)-(110-105))/(110-90) = (15-5)/20 = 0.5, MFV = 500
			candle(105, 115, 100, 110, 1500), // CLV = ((110-100)-(115-110))/15 = (10-5)/15 = 0.333..., MFV = 500
			candle(110, 120, 105, 108, 2000), // CLV = ((108-105)-(120-108))/15 = (3-12)/15 = -0.6, MFV = -1200
		];
		// ADL = 500 + 500 - 1200 = -200
		const result = calcADL(candles);
		expect(result).not.toBeNull();
		expect(result?.toNumber()).toBeCloseTo(-200, 0);
	});

	it("should handle high equals low (CLV = 0)", () => {
		const candles = [
			candle(100, 100, 100, 100, 1000), // CLV = 0, MFV = 0
			candle(100, 110, 90, 105, 1000), // CLV = 0.5, MFV = 500
		];
		const result = calcADL(candles);
		expect(result).not.toBeNull();
		expect(result?.toString()).toBe("500");
	});
});

describe("calcCMF", () => {
	it("should return null for period < 1", () => {
		expect(calcCMF([candle(100, 101, 99, 100), candle(101, 102, 100, 101)], 0)).toBeNull();
	});

	it("should return null for insufficient data", () => {
		expect(calcCMF([], 3)).toBeNull();
		expect(calcCMF([candle(100, 101, 99, 100)], 3)).toBeNull();
		expect(calcCMF([candle(100, 101, 99, 100), candle(101, 102, 100, 101)], 3)).toBeNull();
	});

	it("should return null when volume sum is zero", () => {
		const candles = [
			candle(100, 110, 90, 100, 0),
			candle(100, 110, 90, 105, 0),
			candle(105, 115, 95, 110, 0),
		];
		expect(calcCMF(candles, 3)).toBeNull();
	});

	it("should calculate CMF correctly", () => {
		const candles = [
			candle(100, 110, 90, 100, 1000), // CLV = 0, MFV = 0
			candle(100, 110, 90, 105, 1000), // CLV = 0.5, MFV = 500
			candle(105, 115, 95, 110, 2000), // CLV = 0.5, MFV = 1000
			candle(110, 120, 100, 108, 1500), // CLV = -0.2, MFV = -300
			candle(108, 118, 103, 113, 2500), // CLV = 0.333..., MFV = 833.333
		];
		// Last 3: MFV = [1000, -300, 833.333], volume = [2000, 1500, 2500]
		// CMF = (1000-300+833.333) / 6000 = 1533.333 / 6000 = 0.2555...
		const result = calcCMF(candles, 3);
		expect(result).not.toBeNull();
		expect(result?.toNumber()).toBeCloseTo(0.2555, 3);
	});
});

describe("calcForceIndex", () => {
	it("should return null for period < 1", () => {
		expect(calcForceIndex([candle(100, 101, 99, 100), candle(101, 102, 100, 101)], 0)).toBeNull();
	});

	it("should return null for insufficient data", () => {
		expect(calcForceIndex([], 2)).toBeNull();
		expect(calcForceIndex([candle(100, 101, 99, 100)], 2)).toBeNull();
		expect(calcForceIndex([candle(100, 101, 99, 100), candle(101, 102, 100, 101)], 2)).toBeNull();
	});

	it("should calculate Force Index correctly", () => {
		const candles = [
			candle(100, 101, 99, 100, 1000), // base
			candle(100, 102, 100, 102, 1200), // FI = (102-100)*1200 = 2400
			candle(102, 103, 101, 101, 800), // FI = (101-102)*800 = -800
			candle(101, 102, 100, 103, 1500), // FI = (103-101)*1500 = 3000
		];
		// FI series: [2400, -800, 3000]
		// EMA(period=2) of FI
		// Seed: SMA of first 2 = (2400 + (-800)) / 2 = 800
		// Multiplier = 2/3
		// Smooth for i=2: 3000 * (2/3) + 800 * (1/3) = 2000 + 266.667 = 2266.667
		const result = calcForceIndex(candles, 2);
		expect(result).not.toBeNull();
		expect(result?.toNumber()).toBeCloseTo(2266.667, 2);
	});
});

describe("calcNVI", () => {
	it("should return null for less than 2 candles", () => {
		expect(calcNVI([])).toBeNull();
		expect(calcNVI([candle(100, 101, 99, 100)])).toBeNull();
	});

	it("should calculate NVI correctly with alternating volume", () => {
		const candles = [
			candle(100, 101, 99, 100, 2000), // base, NVI = 1000
			candle(100, 102, 100, 102, 1500), // vol down: NVI = 1000 * (1 + (102-100)/100) = 1000 * 1.02 = 1020
			candle(102, 103, 101, 101, 2000), // vol up: NVI unchanged = 1020
			candle(101, 102, 100, 99, 1000), // vol down: NVI = 1020 * (1 + (99-101)/101) = 1020 * 0.9802 = 999.804
			candle(99, 100, 98, 100, 1500), // vol up: NVI unchanged = 999.804
		];
		const result = calcNVI(candles);
		expect(result).not.toBeNull();
		expect(result?.toNumber()).toBeCloseTo(999.804, 2);
	});

	it("should use custom start value", () => {
		const candles = [
			candle(100, 101, 99, 100, 2000), // base, NVI = 500
			candle(100, 102, 100, 110, 1000), // vol down: NVI = 500 * (1 + (110-100)/100) = 500 * 1.1 = 550
		];
		const result = calcNVI(candles, 500);
		expect(result).not.toBeNull();
		expect(result?.toString()).toBe("550");
	});

	it("should skip candles with zero prevClose", () => {
		const candles = [
			candle(0, 1, 0, 0, 2000), // prevClose will be 0
			candle(0, 1, 0, 10, 1000), // vol down but prevClose=0, skip
			candle(10, 11, 9, 11, 500), // vol down: NVI = 1000 * (1 + (11-10)/10) = 1000 * 1.1 = 1100
		];
		const result = calcNVI(candles);
		expect(result).not.toBeNull();
		expect(result?.toString()).toBe("1100");
	});
});

describe("calcVPT", () => {
	it("should return null for less than 2 candles", () => {
		expect(calcVPT([])).toBeNull();
		expect(calcVPT([candle(100, 101, 99, 100)])).toBeNull();
	});

	it("should calculate VPT correctly", () => {
		const candles = [
			candle(100, 101, 99, 100, 1000), // base, VPT = 0
			candle(100, 102, 100, 110, 1200), // VPT += 1200 * (110-100)/100 = 1200 * 0.1 = 120
			candle(110, 111, 109, 105, 800), // VPT += 800 * (105-110)/110 = 800 * -0.04545 = -36.364
			candle(105, 106, 104, 115, 1500), // VPT += 1500 * (115-105)/105 = 1500 * 0.09524 = 142.857
		];
		// VPT = 120 - 36.364 + 142.857 = 226.493
		const result = calcVPT(candles);
		expect(result).not.toBeNull();
		expect(result?.toNumber()).toBeCloseTo(226.493, 2);
	});

	it("should skip candles with zero prevClose", () => {
		const candles = [
			candle(0, 1, 0, 0, 1000), // base
			candle(0, 1, 0, 10, 1000), // prevClose=0, skip
			candle(10, 11, 9, 11, 1000), // VPT += 1000 * (11-10)/10 = 100
		];
		const result = calcVPT(candles);
		expect(result).not.toBeNull();
		expect(result?.toString()).toBe("100");
	});
});

describe("calcPVO", () => {
	it("should return null for period < 1", () => {
		const candles = [
			candle(100, 101, 99, 100),
			candle(101, 102, 100, 101),
			candle(102, 103, 101, 102),
			candle(103, 104, 102, 103),
		];
		expect(calcPVO(candles, 0, 3, 2)).toBeNull();
		expect(calcPVO(candles, 2, 0, 2)).toBeNull();
		expect(calcPVO(candles, 2, 3, 0)).toBeNull();
	});

	it("should return null for insufficient data", () => {
		expect(calcPVO([], 2, 3, 2)).toBeNull();
		expect(calcPVO([candle(100, 101, 99, 100)], 2, 3, 2)).toBeNull();
		expect(
			calcPVO(
				[candle(100, 101, 99, 100), candle(101, 102, 100, 101), candle(102, 103, 101, 102)],
				2,
				3,
				2,
			),
		).toBeNull();
	});

	it("should calculate PVO correctly", () => {
		const candles = [
			candle(100, 101, 99, 100, 1000),
			candle(101, 102, 100, 101, 1100),
			candle(102, 103, 101, 102, 1200),
			candle(103, 104, 102, 103, 1300),
			candle(104, 105, 103, 104, 1400),
			candle(105, 106, 104, 105, 1500),
		];
		// fast=2, slow=3, signal=2
		// Min data: 3 + 2 - 1 = 4 candles
		// Volumes: [1000, 1100, 1200, 1300, 1400, 1500]
		// Fast EMA(2) series:
		//   i=0: 1000
		//   i=1: 1100 * 2/3 + 1000 * 1/3 = 733.333 + 333.333 = 1066.667
		//   i=2: 1200 * 2/3 + 1066.667 * 1/3 = 800 + 355.556 = 1155.556
		//   i=3: 1300 * 2/3 + 1155.556 * 1/3 = 866.667 + 385.185 = 1251.852
		//   i=4: 1400 * 2/3 + 1251.852 * 1/3 = 933.333 + 417.284 = 1350.617
		//   i=5: 1500 * 2/3 + 1350.617 * 1/3 = 1000 + 450.206 = 1450.206
		// Slow EMA(3) series:
		//   i=0: 1000
		//   i=1: 1100 * 2/4 + 1000 * 2/4 = 550 + 500 = 1050
		//   i=2: 1200 * 2/4 + 1050 * 2/4 = 600 + 525 = 1125
		//   i=3: 1300 * 2/4 + 1125 * 2/4 = 650 + 562.5 = 1212.5
		//   i=4: 1400 * 2/4 + 1212.5 * 2/4 = 700 + 606.25 = 1306.25
		//   i=5: 1500 * 2/4 + 1306.25 * 2/4 = 750 + 653.125 = 1403.125
		// PVO series (from i=0):
		//   i=0: (1000 - 1000) / 1000 * 100 = 0
		//   i=1: (1066.667 - 1050) / 1050 * 100 = 1.5873
		//   i=2: (1155.556 - 1125) / 1125 * 100 = 2.7161
		//   i=3: (1251.852 - 1212.5) / 1212.5 * 100 = 3.2445
		//   i=4: (1350.617 - 1306.25) / 1306.25 * 100 = 3.3952
		//   i=5: (1450.206 - 1403.125) / 1403.125 * 100 = 3.3547
		// Signal EMA(2) on PVO:
		//   i=0: 0
		//   i=1: 1.5873 * 2/3 + 0 * 1/3 = 1.0582
		//   i=2: 2.7161 * 2/3 + 1.0582 * 1/3 = 1.8107 + 0.3527 = 2.1634
		//   i=3: 3.2445 * 2/3 + 2.1634 * 1/3 = 2.163 + 0.7211 = 2.8841
		//   i=4: 3.3952 * 2/3 + 2.8841 * 1/3 = 2.2635 + 0.9614 = 3.2249
		//   i=5: 3.3547 * 2/3 + 3.2249 * 1/3 = 2.2365 + 1.075 = 3.3115
		// Final: pvo = 3.3547, signal = 3.3115, histogram = 0.0432
		const result = calcPVO(candles, 2, 3, 2);
		expect(result).not.toBeNull();
		expect(result?.pvo.toNumber()).toBeCloseTo(3.3547, 2);
		expect(result?.signal.toNumber()).toBeCloseTo(3.3115, 2);
		expect(result?.histogram.toNumber()).toBeCloseTo(0.0432, 2);
	});

	it("should handle zero slowEMA gracefully", () => {
		// This is unlikely in practice but test the guard
		const candles = [
			candle(100, 101, 99, 100, 0),
			candle(101, 102, 100, 101, 0),
			candle(102, 103, 101, 102, 0),
			candle(103, 104, 102, 103, 0),
			candle(104, 105, 103, 104, 100),
		];
		// Slow EMA will be 0 for first few, then jump to 50 at i=4
		// This should produce a valid result but with fewer PVO points
		const result = calcPVO(candles, 2, 3, 2);
		// With min data of 4 candles and zeros, this may or may not return null
		// depending on implementation. Let's verify it doesn't crash.
		// If slowEMA is zero at index where we need it, we skip that PVO value
		// So we might end up with insufficient PVO series for signal EMA
		// This test mainly verifies no crash
		expect(result).toBeDefined();
	});
});
