import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import type { BookLevel, OfiSnapshot } from "./ofi.js";
import { OfiTracker } from "./ofi.js";

const makeLevel = (price: number, size: number): BookLevel => ({
	price: Decimal.from(price),
	size: Decimal.from(size),
});

const makeSnapshot = (
	bestBid: [number, number] | null,
	bestAsk: [number, number] | null,
): OfiSnapshot => ({
	bestBid: bestBid ? makeLevel(bestBid[0], bestBid[1]) : null,
	bestAsk: bestAsk ? makeLevel(bestAsk[0], bestAsk[1]) : null,
});

describe("OfiTracker", () => {
	describe("first snapshot", () => {
		it("returns null on first update (no previous to compare)", () => {
			const tracker = OfiTracker.create();
			const snapshot = makeSnapshot([0.5, 100], [0.51, 100]);
			const ofi = tracker.update(snapshot);
			expect(ofi).toBeNull();
		});

		it("cumulative is zero before any OFI calculated", () => {
			const tracker = OfiTracker.create();
			const snapshot = makeSnapshot([0.5, 100], [0.51, 100]);
			tracker.update(snapshot);
			expect(tracker.cumulative().isZero()).toBe(true);
		});
	});

	describe("unchanged orderbook", () => {
		it("returns zero OFI when prices and sizes are identical", () => {
			const tracker = OfiTracker.create();
			const snapshot = makeSnapshot([0.5, 100], [0.51, 100]);
			tracker.update(snapshot);
			const ofi = tracker.update(snapshot);
			expect(ofi?.isZero()).toBe(true);
		});
	});

	describe("bid side changes", () => {
		it("bid size increases (same price) → positive OFI", () => {
			const tracker = OfiTracker.create();
			tracker.update(makeSnapshot([0.5, 100], [0.51, 100]));
			const ofi = tracker.update(makeSnapshot([0.5, 150], [0.51, 100]));
			expect(ofi?.toNumber()).toBe(50);
		});

		it("bid size decreases (same price) → negative OFI", () => {
			const tracker = OfiTracker.create();
			tracker.update(makeSnapshot([0.5, 100], [0.51, 100]));
			const ofi = tracker.update(makeSnapshot([0.5, 50], [0.51, 100]));
			expect(ofi?.toNumber()).toBe(-50);
		});

		it("bid price increases (new level) → positive OFI (aggressive buyers)", () => {
			const tracker = OfiTracker.create();
			tracker.update(makeSnapshot([0.5, 100], [0.51, 100]));
			const ofi = tracker.update(makeSnapshot([0.51, 150], [0.52, 100]));
			expect(ofi?.toNumber()).toBe(250);
		});

		it("bid price decreases (level consumed) → negative OFI", () => {
			const tracker = OfiTracker.create();
			tracker.update(makeSnapshot([0.5, 100], [0.51, 100]));
			const ofi = tracker.update(makeSnapshot([0.49, 50], [0.51, 100]));
			expect(ofi?.toNumber()).toBe(-100);
		});
	});

	describe("ask side changes", () => {
		it("ask size increases (same price) → negative OFI", () => {
			const tracker = OfiTracker.create();
			tracker.update(makeSnapshot([0.5, 100], [0.51, 100]));
			const ofi = tracker.update(makeSnapshot([0.5, 100], [0.51, 150]));
			expect(ofi?.toNumber()).toBe(-50);
		});

		it("ask size decreases (same price) → positive OFI", () => {
			const tracker = OfiTracker.create();
			tracker.update(makeSnapshot([0.5, 100], [0.51, 100]));
			const ofi = tracker.update(makeSnapshot([0.5, 100], [0.51, 50]));
			expect(ofi?.toNumber()).toBe(50);
		});

		it("ask price decreases (new level) → negative OFI (aggressive sellers)", () => {
			const tracker = OfiTracker.create();
			tracker.update(makeSnapshot([0.5, 100], [0.51, 100]));
			const ofi = tracker.update(makeSnapshot([0.49, 100], [0.5, 150]));
			expect(ofi?.toNumber()).toBe(-250);
		});

		it("ask price increases (level consumed) → positive OFI", () => {
			const tracker = OfiTracker.create();
			tracker.update(makeSnapshot([0.5, 100], [0.51, 100]));
			const ofi = tracker.update(makeSnapshot([0.5, 100], [0.52, 50]));
			expect(ofi?.toNumber()).toBe(100);
		});
	});

	describe("combined changes", () => {
		it("bid and ask both increase → net OFI is delta", () => {
			const tracker = OfiTracker.create();
			tracker.update(makeSnapshot([0.5, 100], [0.51, 100]));
			const ofi = tracker.update(makeSnapshot([0.5, 120], [0.51, 110]));
			expect(ofi?.toNumber()).toBe(10);
		});

		it("bid price up + ask price down → sum of both aggressive flows", () => {
			const tracker = OfiTracker.create();
			tracker.update(makeSnapshot([0.5, 100], [0.52, 100]));
			const ofi = tracker.update(makeSnapshot([0.51, 50], [0.51, 80]));
			expect(ofi?.toNumber()).toBe(50 - 80);
		});
	});

	describe("null levels", () => {
		it("null best bid treated as zero size", () => {
			const tracker = OfiTracker.create();
			tracker.update(makeSnapshot([0.5, 100], [0.51, 100]));
			const ofi = tracker.update(makeSnapshot(null, [0.51, 100]));
			expect(ofi?.toNumber()).toBe(-100);
		});

		it("null best ask treated as zero size", () => {
			const tracker = OfiTracker.create();
			tracker.update(makeSnapshot([0.5, 100], [0.51, 100]));
			const ofi = tracker.update(makeSnapshot([0.5, 100], null));
			expect(ofi?.toNumber()).toBe(100);
		});

		it("both null → zero OFI", () => {
			const tracker = OfiTracker.create();
			tracker.update(makeSnapshot([0.5, 100], [0.51, 100]));
			const ofi = tracker.update(makeSnapshot(null, null));
			expect(ofi?.isZero()).toBe(true);
		});

		it("first snapshot with null levels → second snapshot calculates OFI", () => {
			const tracker = OfiTracker.create();
			tracker.update(makeSnapshot(null, null));
			const ofi = tracker.update(makeSnapshot([0.5, 100], [0.51, 100]));
			expect(ofi?.toNumber()).toBe(0);
		});
	});

	describe("cumulative", () => {
		it("tracks running total of OFI", () => {
			const tracker = OfiTracker.create();
			tracker.update(makeSnapshot([0.5, 100], [0.51, 100]));
			tracker.update(makeSnapshot([0.5, 120], [0.51, 100]));
			tracker.update(makeSnapshot([0.5, 130], [0.51, 110]));
			const cumulative = tracker.cumulative();
			expect(cumulative.toNumber()).toBe(20);
		});

		it("cumulative persists across multiple updates", () => {
			const tracker = OfiTracker.create();
			tracker.update(makeSnapshot([0.5, 100], [0.51, 100]));
			tracker.update(makeSnapshot([0.5, 150], [0.51, 100]));
			expect(tracker.cumulative().toNumber()).toBe(50);
			tracker.update(makeSnapshot([0.5, 150], [0.51, 130]));
			expect(tracker.cumulative().toNumber()).toBe(20);
		});
	});

	describe("reset", () => {
		it("clears cumulative state", () => {
			const tracker = OfiTracker.create();
			tracker.update(makeSnapshot([0.5, 100], [0.51, 100]));
			tracker.update(makeSnapshot([0.5, 150], [0.51, 100]));
			expect(tracker.cumulative().toNumber()).toBe(50);
			tracker.reset();
			expect(tracker.cumulative().isZero()).toBe(true);
		});

		it("next update after reset returns null (no previous)", () => {
			const tracker = OfiTracker.create();
			tracker.update(makeSnapshot([0.5, 100], [0.51, 100]));
			tracker.update(makeSnapshot([0.5, 150], [0.51, 100]));
			tracker.reset();
			const ofi = tracker.update(makeSnapshot([0.5, 200], [0.51, 100]));
			expect(ofi).toBeNull();
		});
	});

	describe("table-driven scenarios", () => {
		it.each([
			{
				desc: "zero to positive imbalance",
				prev: [0.5, 100, 0.51, 100] as const,
				next: [0.5, 150, 0.51, 100] as const,
				expected: 50,
			},
			{
				desc: "zero to negative imbalance",
				prev: [0.5, 100, 0.51, 100] as const,
				next: [0.5, 100, 0.51, 150] as const,
				expected: -50,
			},
			{
				desc: "bid price jump (aggressive)",
				prev: [0.5, 100, 0.52, 100] as const,
				next: [0.51, 80, 0.52, 100] as const,
				expected: 80,
			},
			{
				desc: "ask price drop (aggressive)",
				prev: [0.5, 100, 0.52, 100] as const,
				next: [0.5, 100, 0.51, 80] as const,
				expected: -80,
			},
			{
				desc: "both sides shrink equally",
				prev: [0.5, 100, 0.51, 100] as const,
				next: [0.5, 50, 0.51, 50] as const,
				expected: 0,
			},
		])("$desc", ({ prev, next, expected }) => {
			const tracker = OfiTracker.create();
			tracker.update(makeSnapshot([prev[0], prev[1]], [prev[2], prev[3]]));
			const ofi = tracker.update(makeSnapshot([next[0], next[1]], [next[2], next[3]]));
			expect(ofi?.toNumber()).toBe(expected);
		});
	});
});
