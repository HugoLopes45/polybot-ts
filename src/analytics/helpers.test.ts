import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { slidingHigh, slidingLow, trueRange } from "./helpers.js";
import type { Candle } from "./types.js";

const d = (v: number | string) => Decimal.from(v);

function makeCandle(
	high: number,
	low: number,
	close: number,
	prevClose: number,
): { candle: Candle; prevClose: Decimal } {
	return {
		candle: {
			open: d(close),
			high: d(high),
			low: d(low),
			close: d(close),
			volume: d(0),
			timestampMs: 0,
		},
		prevClose: d(prevClose),
	};
}

describe("trueRange", () => {
	it("returns H-L when no gap (normal candle)", () => {
		const { candle, prevClose } = makeCandle(110, 90, 100, 100);
		expect(trueRange(candle, prevClose).toNumber()).toBe(20);
	});

	it("returns |H-prevClose| when upward gap", () => {
		const { candle, prevClose } = makeCandle(120, 110, 115, 100);
		const tr = trueRange(candle, prevClose);
		expect(tr.toNumber()).toBe(20);
	});

	it("returns |L-prevClose| when downward gap", () => {
		const { candle, prevClose } = makeCandle(90, 80, 85, 100);
		const tr = trueRange(candle, prevClose);
		expect(tr.toNumber()).toBe(20);
	});

	it("uses larger gap when both gaps exist", () => {
		const { candle, prevClose } = makeCandle(130, 85, 100, 100);
		const tr = trueRange(candle, prevClose);
		expect(tr.toNumber()).toBe(45);
	});

	it("handles gap larger than high-low range", () => {
		const { candle, prevClose } = makeCandle(105, 100, 102, 80);
		const tr = trueRange(candle, prevClose);
		expect(tr.toNumber()).toBe(25);
	});

	it("handles small gap with large high-low", () => {
		const { candle, prevClose } = makeCandle(150, 50, 100, 105);
		const tr = trueRange(candle, prevClose);
		expect(tr.toNumber()).toBe(100);
	});
});

describe("slidingHigh", () => {
	const arr = [d(10), d(30), d(20), d(50), d(40)] as const;

	it("returns single element for single-element window", () => {
		expect(slidingHigh(arr, 0, 0).toNumber()).toBe(10);
	});

	it("finds maximum in middle window", () => {
		expect(slidingHigh(arr, 1, 3).toNumber()).toBe(50);
	});

	it("finds maximum at start of window", () => {
		expect(slidingHigh(arr, 0, 2).toNumber()).toBe(30);
	});

	it("finds maximum at end of window", () => {
		expect(slidingHigh(arr, 2, 4).toNumber()).toBe(50);
	});

	it("handles entire array", () => {
		expect(slidingHigh(arr, 0, 4).toNumber()).toBe(50);
	});

	it("returns first element when window size is 1", () => {
		expect(slidingHigh(arr, 3, 3).toNumber()).toBe(50);
	});
});

describe("slidingLow", () => {
	const arr = [d(50), d(30), d(40), d(20), d(35)] as const;

	it("returns single element for single-element window", () => {
		expect(slidingLow(arr, 0, 0).toNumber()).toBe(50);
	});

	it("finds minimum in middle window", () => {
		expect(slidingLow(arr, 1, 3).toNumber()).toBe(20);
	});

	it("finds minimum at start of window", () => {
		expect(slidingLow(arr, 0, 2).toNumber()).toBe(30);
	});

	it("finds minimum at end of window", () => {
		expect(slidingLow(arr, 2, 4).toNumber()).toBe(20);
	});

	it("handles entire array", () => {
		expect(slidingLow(arr, 0, 4).toNumber()).toBe(20);
	});

	it("returns first element when window size is 1", () => {
		expect(slidingLow(arr, 3, 3).toNumber()).toBe(20);
	});
});

describe("boundary conditions", () => {
	it("slidingHigh handles decreasing values", () => {
		const arr = [d(50), d(40), d(30), d(20)] as const;
		expect(slidingHigh(arr, 0, 3).toNumber()).toBe(50);
	});

	it("slidingLow handles increasing values", () => {
		const arr = [d(20), d(30), d(40), d(50)] as const;
		expect(slidingLow(arr, 0, 3).toNumber()).toBe(20);
	});

	it("slidingHigh and slidingLow are independent", () => {
		const arr = [d(5), d(10), d(3), d(8)] as const;
		expect(slidingHigh(arr, 0, 3).toNumber()).toBe(10);
		expect(slidingLow(arr, 0, 3).toNumber()).toBe(3);
	});

	it("trueRange equals high-low when prevClose is mid-range", () => {
		const { candle, prevClose } = makeCandle(120, 80, 100, 100);
		const tr = trueRange(candle, prevClose);
		expect(tr.toNumber()).toBe(40);
	});
});
