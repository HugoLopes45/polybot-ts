import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { isErr, isOk, unwrap } from "../shared/result.js";
import { KellySizer } from "./kelly-sizer.js";

describe("KellySizer", () => {
	describe("factory methods", () => {
		it("full() creates full Kelly sizer", () => {
			const sizer = KellySizer.full();
			expect(sizer.name).toBe("Kelly");
		});

		it("half() creates half Kelly sizer", () => {
			const sizer = KellySizer.half();
			expect(sizer.name).toBe("HalfKelly");
		});

		it("quarter() creates quarter Kelly sizer", () => {
			const sizer = KellySizer.quarter();
			expect(sizer.name).toBe("QuarterKelly");
		});

		it("create() returns Ok with custom fraction sizer", () => {
			const result = KellySizer.create(0.3);
			expect(isOk(result)).toBe(true);
			const sizer = unwrap(result);
			expect(sizer.name).toContain("Kelly");
		});

		it("create() returns Err on negative fraction", () => {
			const result = KellySizer.create(-0.5);
			expect(isErr(result)).toBe(true);
		});

		it("create() returns Err on fraction > 1", () => {
			const result = KellySizer.create(1.5);
			expect(isErr(result)).toBe(true);
		});

		it("create() returns Err on zero fraction", () => {
			const result = KellySizer.create(0);
			expect(isErr(result)).toBe(true);
		});
	});

	describe("size - Full Kelly", () => {
		it("edge=0.1, price=0.5 → odds=1, f*=0.1, size=200 tokens", () => {
			const sizer = KellySizer.full();
			const result = sizer.size({
				balance: Decimal.from(1000),
				edge: Decimal.from(0.1),
				marketPrice: Decimal.from(0.5),
			});

			// odds = (1 - 0.5) / 0.5 = 1
			// kellyFull = 0.1 / 1 = 0.1
			// f = 0.1 * 1 = 0.1
			// size = 1000 * 0.1 / 0.5 = 200
			expect(result.size.toString()).toBe("200");
			expect(result.fraction.toString()).toBe("0.1");
			expect(result.method).toBe("kelly");
		});

		it("negative edge → zero size (no short selling)", () => {
			const sizer = KellySizer.full();
			const result = sizer.size({
				balance: Decimal.from(1000),
				edge: Decimal.from(-0.1),
				marketPrice: Decimal.from(0.5),
			});

			expect(result.size.toString()).toBe("0");
			expect(result.fraction.toString()).toBe("0");
		});

		it("high edge → clamped to maxPositionPct", () => {
			const sizer = KellySizer.full();
			const result = sizer.size({
				balance: Decimal.from(1000),
				edge: Decimal.from(0.5), // very high edge
				marketPrice: Decimal.from(0.5),
				maxPositionPct: Decimal.from(0.25),
			});

			// odds = 1, kellyFull = 0.5 / 1 = 0.5
			// Clamped to 0.25
			expect(result.fraction.toString()).toBe("0.25");
			expect(result.size.toString()).toBe("500"); // 1000 * 0.25 / 0.5
		});

		it("zero market price → zero size", () => {
			const sizer = KellySizer.full();
			const result = sizer.size({
				balance: Decimal.from(1000),
				edge: Decimal.from(0.1),
				marketPrice: Decimal.zero(),
			});

			expect(result.size.toString()).toBe("0");
		});

		it("market price = 1 → infinite odds → zero size", () => {
			const sizer = KellySizer.full();
			const result = sizer.size({
				balance: Decimal.from(1000),
				edge: Decimal.from(0.1),
				marketPrice: Decimal.from(1),
			});

			expect(result.size.toString()).toBe("0");
		});
	});

	describe("size - Half Kelly", () => {
		it("same edge=0.1, price=0.5 → half the full Kelly size", () => {
			const sizer = KellySizer.half();
			const result = sizer.size({
				balance: Decimal.from(1000),
				edge: Decimal.from(0.1),
				marketPrice: Decimal.from(0.5),
			});

			// Full Kelly f = 0.1, Half Kelly = 0.05
			// size = 1000 * 0.05 / 0.5 = 100
			expect(result.size.toString()).toBe("100");
			expect(result.fraction.toString()).toBe("0.05");
			expect(result.method).toBe("half_kelly");
		});

		it("negative edge → zero size", () => {
			const sizer = KellySizer.half();
			const result = sizer.size({
				balance: Decimal.from(1000),
				edge: Decimal.from(-0.05),
				marketPrice: Decimal.from(0.5),
			});

			expect(result.size.toString()).toBe("0");
		});
	});

	describe("size - Quarter Kelly", () => {
		it("same edge=0.1, price=0.5 → quarter the full Kelly size", () => {
			const sizer = KellySizer.quarter();
			const result = sizer.size({
				balance: Decimal.from(1000),
				edge: Decimal.from(0.1),
				marketPrice: Decimal.from(0.5),
			});

			// Full Kelly f = 0.1, Quarter Kelly = 0.025
			// size = 1000 * 0.025 / 0.5 = 50
			expect(result.size.toString()).toBe("50");
			expect(result.fraction.toString()).toBe("0.025");
			expect(result.method).toBe("quarter_kelly");
		});
	});

	describe("size - table-driven", () => {
		it.each([
			{
				edge: 0.2,
				price: 0.4,
				balance: 1000,
				fraction: 1,
				expectedF: 0.1333,
				desc: "high edge, low price",
			},
			{
				edge: 0.05,
				price: 0.6,
				balance: 2000,
				fraction: 1,
				expectedF: 0.075,
				desc: "low edge, high price",
			},
			{
				edge: 0.1,
				price: 0.3,
				balance: 500,
				fraction: 0.5,
				expectedF: 0.02143,
				desc: "half Kelly, low price",
			},
			{
				edge: 0.15,
				price: 0.7,
				balance: 1500,
				fraction: 0.25,
				expectedF: 0.0875,
				desc: "quarter Kelly, high price",
			},
		])(
			"$desc: edge=$edge, price=$price, fraction=$fraction",
			({ edge, price, balance, fraction, expectedF }) => {
				const sizer = unwrap(KellySizer.create(fraction));
				const result = sizer.size({
					balance: Decimal.from(balance),
					edge: Decimal.from(edge),
					marketPrice: Decimal.from(price),
				});

				expect(result.fraction.toNumber()).toBeCloseTo(expectedF, 4);
			},
		);
	});

	describe("size - edge cases", () => {
		it("zero balance → zero size", () => {
			const sizer = KellySizer.full();
			const result = sizer.size({
				balance: Decimal.zero(),
				edge: Decimal.from(0.1),
				marketPrice: Decimal.from(0.5),
			});

			expect(result.size.toString()).toBe("0");
		});

		it("zero edge → zero size", () => {
			const sizer = KellySizer.full();
			const result = sizer.size({
				balance: Decimal.from(1000),
				edge: Decimal.zero(),
				marketPrice: Decimal.from(0.5),
			});

			expect(result.size.toString()).toBe("0");
			expect(result.fraction.toString()).toBe("0");
		});

		it("default maxPositionPct is 0.25", () => {
			const sizer = KellySizer.full();
			const result = sizer.size({
				balance: Decimal.from(1000),
				edge: Decimal.from(0.5), // very high → would exceed 25%
				marketPrice: Decimal.from(0.5),
			});

			// Clamped to 0.25
			expect(result.fraction.toString()).toBe("0.25");
		});

		it("very small edge → very small size", () => {
			const sizer = KellySizer.full();
			const result = sizer.size({
				balance: Decimal.from(1000),
				edge: Decimal.from(0.001),
				marketPrice: Decimal.from(0.5),
			});

			// odds = 1, kellyFull = 0.001
			// size = 1000 * 0.001 / 0.5 = 2
			expect(result.size.toString()).toBe("2");
		});
	});
});
