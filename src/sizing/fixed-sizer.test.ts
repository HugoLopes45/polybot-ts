import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { isErr, isOk, unwrap } from "../shared/result.js";
import { FixedSizer } from "./fixed-sizer.js";

describe("FixedSizer", () => {
	describe("create", () => {
		it("returns Ok with sizer for valid percentage", () => {
			const result = FixedSizer.create(5);
			expect(isOk(result)).toBe(true);
			const sizer = unwrap(result);
			expect(sizer.name).toBe("Fixed");
		});

		it("returns Err on negative fraction", () => {
			const result = FixedSizer.create(-5);
			expect(isErr(result)).toBe(true);
		});

		it("returns Err on zero fraction", () => {
			const result = FixedSizer.create(0);
			expect(isErr(result)).toBe(true);
		});

		it("returns Err on fraction > 100", () => {
			const result = FixedSizer.create(101);
			expect(isErr(result)).toBe(true);
		});
	});

	describe("size", () => {
		it("allocates 5% of $1000 balance at price $0.50 → 100 tokens", () => {
			const sizer = unwrap(FixedSizer.create(5));
			const result = sizer.size({
				balance: Decimal.from(1000),
				edge: Decimal.from(0.1),
				marketPrice: Decimal.from(0.5),
			});

			// 5% of 1000 = 50, 50 / 0.5 = 100 tokens
			expect(result.size.toString()).toBe("100");
			expect(result.fraction.toString()).toBe("0.05");
			expect(result.method).toBe("fixed");
		});

		it("respects maxPositionPct cap", () => {
			const sizer = unwrap(FixedSizer.create(30)); // 30%
			const result = sizer.size({
				balance: Decimal.from(1000),
				edge: Decimal.from(0.1),
				marketPrice: Decimal.from(0.5),
				maxPositionPct: Decimal.from(0.2), // 20% max
			});

			// Clamped to 20% of 1000 = 200, 200 / 0.5 = 400 tokens
			expect(result.size.toString()).toBe("400");
			expect(result.fraction.toString()).toBe("0.2");
			expect(result.method).toBe("fixed");
		});

		it("zero balance → zero size", () => {
			const sizer = unwrap(FixedSizer.create(5));
			const result = sizer.size({
				balance: Decimal.zero(),
				edge: Decimal.from(0.1),
				marketPrice: Decimal.from(0.5),
			});

			expect(result.size.toString()).toBe("0");
			expect(result.fraction.toString()).toBe("0.05");
		});

		it("very high market price → small token size", () => {
			const sizer = unwrap(FixedSizer.create(10));
			const result = sizer.size({
				balance: Decimal.from(1000),
				edge: Decimal.from(0.1),
				marketPrice: Decimal.from(0.9), // expensive
			});

			// 10% of 1000 = 100, 100 / 0.9 = 111.111...
			expect(result.size.toNumber()).toBeCloseTo(111.11, 2);
			expect(result.fraction.toString()).toBe("0.1");
		});

		it("zero market price → zero size", () => {
			const sizer = unwrap(FixedSizer.create(5));
			const result = sizer.size({
				balance: Decimal.from(1000),
				edge: Decimal.from(0.1),
				marketPrice: Decimal.zero(),
			});

			expect(result.size.toString()).toBe("0");
		});

		it("default maxPositionPct is 0.25 (25%)", () => {
			const sizer = unwrap(FixedSizer.create(30)); // 30% > default 25%
			const result = sizer.size({
				balance: Decimal.from(1000),
				edge: Decimal.from(0.1),
				marketPrice: Decimal.from(0.5),
			});

			// Clamped to 25% of 1000 = 250, 250 / 0.5 = 500 tokens
			expect(result.size.toString()).toBe("500");
			expect(result.fraction.toString()).toBe("0.25");
		});

		it.each([
			{ pct: 1, balance: 1000, price: 0.5, expected: 20 }, // 1% of 1000 / 0.5
			{ pct: 10, balance: 500, price: 0.25, expected: 200 }, // 10% of 500 / 0.25
			{ pct: 25, balance: 2000, price: 0.8, expected: 625 }, // 25% of 2000 / 0.8
		])(
			"$pct% of $$$balance at price $$$price → $expected tokens",
			({ pct, balance, price, expected }) => {
				const sizer = unwrap(FixedSizer.create(pct));
				const result = sizer.size({
					balance: Decimal.from(balance),
					edge: Decimal.from(0.1),
					marketPrice: Decimal.from(price),
				});

				expect(result.size.toNumber()).toBeCloseTo(expected, 2);
			},
		);
	});
});
