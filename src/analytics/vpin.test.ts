import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { VpinTracker } from "./vpin.js";
import type { TradeUpdate } from "./vpin.js";

describe("VpinTracker", () => {
	const makeConfig = (bucketSize: string, numBuckets: number) => ({
		bucketSize: Decimal.from(bucketSize),
		numBuckets,
	});

	const makeTrade = (price: string, size: string, timestampMs = 0): TradeUpdate => ({
		price: Decimal.from(price),
		size: Decimal.from(size),
		timestampMs,
	});

	describe("value()", () => {
		it("returns null with no data", () => {
			const tracker = VpinTracker.create(makeConfig("100", 5));
			expect(tracker.value()).toBeNull();
		});

		it("returns null with insufficient buckets", () => {
			const tracker = VpinTracker.create(makeConfig("100", 5));
			tracker.update(makeTrade("0.5", "50"));
			tracker.update(makeTrade("0.51", "50"));
			expect(tracker.filledBuckets).toBe(1);
			expect(tracker.value()).toBeNull();
		});

		it("computes correct VPIN for all-buy trades (VPIN ≈ 1.0)", () => {
			const tracker = VpinTracker.create(makeConfig("100", 3));

			for (let i = 0; i < 3; i++) {
				tracker.update(makeTrade(`${0.5 + i * 0.01}`, "100"));
			}

			const vpin = tracker.value();
			expect(vpin).not.toBeNull();
			expect(vpin?.toNumber()).toBeCloseTo(1.0, 6);
		});

		it("computes correct VPIN for balanced buy/sell trades (VPIN ≈ 0.0)", () => {
			const tracker = VpinTracker.create(makeConfig("100", 3));

			tracker.update(makeTrade("0.5", "100"));
			tracker.update(makeTrade("0.51", "50"));
			tracker.update(makeTrade("0.5", "50"));

			tracker.update(makeTrade("0.51", "50"));
			tracker.update(makeTrade("0.5", "50"));

			tracker.update(makeTrade("0.51", "50"));
			tracker.update(makeTrade("0.5", "50"));

			const vpin = tracker.value();
			expect(vpin).not.toBeNull();
			expect(vpin?.toNumber()).toBeCloseTo(0.0, 6);
		});

		it("computes correct VPIN for imbalanced trades", () => {
			const tracker = VpinTracker.create(makeConfig("100", 2));

			tracker.update(makeTrade("0.5", "100"));

			tracker.update(makeTrade("0.51", "60"));
			tracker.update(makeTrade("0.5", "40"));

			const vpin = tracker.value();
			expect(vpin).not.toBeNull();
			expect(vpin?.toNumber()).toBeCloseTo(0.6, 6);
		});
	});

	describe("tick rule classification", () => {
		it("classifies ascending prices as buys", () => {
			const tracker = VpinTracker.create(makeConfig("100", 2));

			tracker.update(makeTrade("0.5", "100"));
			tracker.update(makeTrade("0.51", "100"));

			const vpin = tracker.value();
			expect(vpin).not.toBeNull();
			expect(vpin?.toNumber()).toBeCloseTo(1.0, 6);
		});

		it("classifies descending prices as sells", () => {
			const tracker = VpinTracker.create(makeConfig("100", 2));

			tracker.update(makeTrade("0.51", "100"));
			tracker.update(makeTrade("0.5", "100"));

			const vpin = tracker.value();
			expect(vpin).not.toBeNull();
			expect(vpin?.toNumber()).toBeCloseTo(1.0, 6);
		});

		it("classifies equal price as same direction as last trade", () => {
			const tracker = VpinTracker.create(makeConfig("100", 2));

			tracker.update(makeTrade("0.5", "100"));
			tracker.update(makeTrade("0.51", "25"));
			tracker.update(makeTrade("0.51", "25"));
			tracker.update(makeTrade("0.5", "25"));
			tracker.update(makeTrade("0.5", "25"));

			const vpin = tracker.value();
			expect(vpin).not.toBeNull();
			expect(vpin?.toNumber()).toBeCloseTo(0.5, 6);
		});

		it("classifies first trade as buy when no prior price", () => {
			const tracker = VpinTracker.create(makeConfig("100", 1));

			tracker.update(makeTrade("0.5", "100"));

			const vpin = tracker.value();
			expect(vpin).not.toBeNull();
			expect(vpin?.toNumber()).toBeCloseTo(1.0, 6);
		});
	});

	describe("bucket rollover", () => {
		it("fills multiple buckets correctly", () => {
			const tracker = VpinTracker.create(makeConfig("100", 3));

			tracker.update(makeTrade("0.5", "100"));
			expect(tracker.filledBuckets).toBe(1);

			tracker.update(makeTrade("0.51", "100"));
			expect(tracker.filledBuckets).toBe(2);

			tracker.update(makeTrade("0.52", "100"));
			expect(tracker.filledBuckets).toBe(3);
		});

		it("drops old buckets when window is full", () => {
			const tracker = VpinTracker.create(makeConfig("100", 2));

			tracker.update(makeTrade("0.5", "100"));
			tracker.update(makeTrade("0.49", "100"));
			expect(tracker.filledBuckets).toBe(2);

			tracker.update(makeTrade("0.5", "100"));
			expect(tracker.filledBuckets).toBe(2);

			const vpin = tracker.value();
			expect(vpin).not.toBeNull();
		});

		it("single large trade fills multiple buckets", () => {
			const tracker = VpinTracker.create(makeConfig("100", 3));

			tracker.update(makeTrade("0.5", "300"));
			expect(tracker.filledBuckets).toBe(3);

			const vpin = tracker.value();
			expect(vpin).not.toBeNull();
			expect(vpin?.toNumber()).toBeCloseTo(1.0, 6);
		});

		it("partial bucket plus large trade fills correctly", () => {
			const tracker = VpinTracker.create(makeConfig("100", 3));

			tracker.update(makeTrade("0.5", "50"));
			expect(tracker.filledBuckets).toBe(0);

			tracker.update(makeTrade("0.51", "250"));
			expect(tracker.filledBuckets).toBe(3);
		});
	});

	describe("filledBuckets", () => {
		it("tracks correctly as buckets fill", () => {
			const tracker = VpinTracker.create(makeConfig("100", 5));

			expect(tracker.filledBuckets).toBe(0);

			tracker.update(makeTrade("0.5", "50"));
			expect(tracker.filledBuckets).toBe(0);

			tracker.update(makeTrade("0.51", "50"));
			expect(tracker.filledBuckets).toBe(1);

			tracker.update(makeTrade("0.52", "100"));
			expect(tracker.filledBuckets).toBe(2);

			tracker.update(makeTrade("0.53", "200"));
			expect(tracker.filledBuckets).toBe(4);
		});

		it("caps at numBuckets as rolling window drops old buckets", () => {
			const tracker = VpinTracker.create(makeConfig("100", 2));

			tracker.update(makeTrade("0.5", "100"));
			tracker.update(makeTrade("0.51", "100"));
			expect(tracker.filledBuckets).toBe(2);

			tracker.update(makeTrade("0.52", "100"));
			expect(tracker.filledBuckets).toBe(2);

			tracker.update(makeTrade("0.53", "100"));
			expect(tracker.filledBuckets).toBe(2);
		});
	});

	describe("create validation", () => {
		it("throws when bucketSize is zero", () => {
			expect(() => VpinTracker.create(makeConfig("0", 10))).toThrow(
				"VpinTracker: bucketSize must be positive",
			);
		});

		it("throws when bucketSize is negative", () => {
			expect(() => VpinTracker.create(makeConfig("-5", 10))).toThrow(
				"VpinTracker: bucketSize must be positive",
			);
		});

		it("throws when numBuckets is zero", () => {
			expect(() => VpinTracker.create(makeConfig("100", 0))).toThrow(
				"VpinTracker: numBuckets must be >= 1",
			);
		});
	});

	describe("edge cases", () => {
		it("handles zero-sized trades gracefully", () => {
			const tracker = VpinTracker.create(makeConfig("100", 2));

			tracker.update(makeTrade("0.5", "0"));
			expect(tracker.filledBuckets).toBe(0);

			tracker.update(makeTrade("0.51", "100"));
			tracker.update(makeTrade("0.52", "100"));
			expect(tracker.filledBuckets).toBe(2);
		});

		it("handles trade size exactly equal to bucket size", () => {
			const tracker = VpinTracker.create(makeConfig("100", 2));

			tracker.update(makeTrade("0.5", "100"));
			expect(tracker.filledBuckets).toBe(1);

			tracker.update(makeTrade("0.51", "100"));
			expect(tracker.filledBuckets).toBe(2);
		});

		it("handles fractional bucket fills", () => {
			const tracker = VpinTracker.create(makeConfig("100", 3));

			tracker.update(makeTrade("0.5", "33.33"));
			tracker.update(makeTrade("0.51", "33.33"));
			tracker.update(makeTrade("0.52", "33.34"));
			expect(tracker.filledBuckets).toBe(1);

			tracker.update(makeTrade("0.53", "100"));
			expect(tracker.filledBuckets).toBe(2);
		});
	});
});
