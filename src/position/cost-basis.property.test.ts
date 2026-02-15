import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { CostBasis, type FillRecord } from "./cost-basis.js";

describe("CostBasis FIFO (property-based)", () => {
	describe("total filled equals sum of lots", () => {
		it("totalSize equals sum of all fill sizes", () => {
			fc.assert(
				fc.property(
					fc.array(
						fc.record({
							price: fc.float(),
							size: fc.float({ min: Math.fround(0.0001), max: Math.fround(10000) }),
						}),
						{ maxLength: 20 },
					),
					(fills) => {
						const validFills = fills
							.filter((f) => Number.isFinite(f.price) && Number.isFinite(f.size) && f.size > 0)
							.map(
								(f, i): FillRecord => ({
									price: Decimal.from(f.price),
									size: Decimal.from(f.size),
									timestampMs: i * 1000,
								}),
							);
						if (validFills.length === 0) return true;

						let cb = CostBasis.create();
						for (const fill of validFills) {
							cb = cb.addFill(fill);
						}

						const expectedSize = validFills.reduce((acc, f) => acc.add(f.size), Decimal.zero());
						expect(cb.totalSize().eq(expectedSize)).toBe(true);
					},
				),
				{ numRuns: 500 },
			);
		});

		it("totalCost equals sum of (price * size) for all fills", () => {
			fc.assert(
				fc.property(
					fc.array(
						fc.record({
							price: fc.float({ min: Math.fround(0.0001), max: Math.fround(10000) }),
							size: fc.float({ min: Math.fround(0.0001), max: Math.fround(10000) }),
						}),
						{ maxLength: 20 },
					),
					(fills) => {
						const validFills = fills
							.filter((f) => Number.isFinite(f.price) && Number.isFinite(f.size) && f.size > 0)
							.map(
								(f, i): FillRecord => ({
									price: Decimal.from(f.price),
									size: Decimal.from(f.size),
									timestampMs: i * 1000,
								}),
							);
						if (validFills.length === 0) return true;

						let cb = CostBasis.create();
						for (const fill of validFills) {
							cb = cb.addFill(fill);
						}

						const expectedCost = validFills.reduce(
							(acc, f) => acc.add(f.price.mul(f.size)),
							Decimal.zero(),
						);
						expect(cb.totalCost().eq(expectedCost)).toBe(true);
					},
				),
				{ numRuns: 500 },
			);
		});

		it("fillCount equals number of added fills", () => {
			fc.assert(
				fc.property(
					fc.array(
						fc.record({
							price: fc.float(),
							size: fc.float({ min: Math.fround(0.0001), max: Math.fround(10000) }),
						}),
						{ maxLength: 20 },
					),
					(fills) => {
						const validFills = fills
							.filter((f) => Number.isFinite(f.price) && Number.isFinite(f.size) && f.size > 0)
							.map(
								(f, i): FillRecord => ({
									price: Decimal.from(f.price),
									size: Decimal.from(f.size),
									timestampMs: i * 1000,
								}),
							);

						let cb = CostBasis.create();
						for (const fill of validFills) {
							cb = cb.addFill(fill);
						}

						expect(cb.fillCount()).toBe(validFills.length);
					},
				),
				{ numRuns: 500 },
			);
		});
	});

	describe("FIFO ordering", () => {
		it("fills are stored in insertion order", () => {
			fc.assert(
				fc.property(
					fc.array(
						fc.record({
							price: fc.float({ min: Math.fround(0.0001), max: Math.fround(10000) }),
							size: fc.float({ min: Math.fround(0.0001), max: Math.fround(10000) }),
						}),
						{ maxLength: 20 },
					),
					(fills) => {
						const validFills = fills
							.filter((f) => Number.isFinite(f.price) && Number.isFinite(f.size) && f.size > 0)
							.map(
								(f, i): FillRecord => ({
									price: Decimal.from(f.price),
									size: Decimal.from(f.size),
									timestampMs: i * 1000,
								}),
							);
						if (validFills.length < 2) return true;

						let cb = CostBasis.create();
						for (const fill of validFills) {
							cb = cb.addFill(fill);
						}

						const stored = cb.allFills();
						expect(stored.length).toBe(validFills.length);
						for (let i = 0; i < validFills.length; i++) {
							expect(stored[i]?.price.eq(validFills[i].price)).toBe(true);
							expect(stored[i]?.size.eq(validFills[i].size)).toBe(true);
						}
					},
				),
				{ numRuns: 300 },
			);
		});
	});

	describe("immutability", () => {
		it("adding fills does not modify original CostBasis", () => {
			fc.assert(
				fc.property(
					fc.array(
						fc.record({
							price: fc.float({ min: Math.fround(0.0001), max: Math.fround(10000) }),
							size: fc.float({ min: Math.fround(0.0001), max: Math.fround(10000) }),
						}),
						{ maxLength: 5 },
					),
					(fills) => {
						const validFills = fills
							.filter((f) => Number.isFinite(f.price) && Number.isFinite(f.size) && f.size > 0)
							.map(
								(f, i): FillRecord => ({
									price: Decimal.from(f.price),
									size: Decimal.from(f.size),
									timestampMs: i * 1000,
								}),
							);
						if (validFills.length < 2) return true;

						const original = CostBasis.create();
						let mutated = original;
						for (const fill of validFills) {
							const prev = mutated;
							mutated = mutated.addFill(fill);
							expect(prev.fillCount()).toBeLessThan(mutated.fillCount());
						}
					},
				),
				{ numRuns: 200 },
			);
		});
	});

	describe("weighted average price", () => {
		it("weightedAvgPrice is totalCost / totalSize when size > 0", () => {
			fc.assert(
				fc.property(
					fc.array(
						fc.record({
							price: fc.float({ min: Math.fround(0.0001), max: Math.fround(10000) }),
							size: fc.float({ min: Math.fround(0.0001), max: Math.fround(10000) }),
						}),
						{ maxLength: 20 },
					),
					(fills) => {
						const validFills = fills
							.filter((f) => Number.isFinite(f.price) && Number.isFinite(f.size) && f.size > 0)
							.map(
								(f, i): FillRecord => ({
									price: Decimal.from(f.price),
									size: Decimal.from(f.size),
									timestampMs: i * 1000,
								}),
							);
						if (validFills.length === 0) return true;

						let cb = CostBasis.create();
						for (const fill of validFills) {
							cb = cb.addFill(fill);
						}

						const expectedAvg = cb.totalCost().div(cb.totalSize());
						const actualAvg = cb.weightedAvgPrice();
						expect(actualAvg).not.toBeNull();
						expect(actualAvg?.eq(expectedAvg)).toBe(true);
					},
				),
				{ numRuns: 500 },
			);
		});

		it("returns null for empty CostBasis", () => {
			const cb = CostBasis.create();
			expect(cb.weightedAvgPrice()).toBeNull();
		});
	});
});
