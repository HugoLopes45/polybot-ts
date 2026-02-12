import { describe, expect, it } from "vitest";
import { LibDecimal } from "./index.js";

describe("LibDecimal", () => {
	describe("factories", () => {
		it("creates from string", () => {
			expect(LibDecimal.from("1.5").toString()).toBe("1.5");
			expect(LibDecimal.from("100").toString()).toBe("100");
			expect(LibDecimal.from("0.001").toString()).toBe("0.001");
		});

		it("creates from number", () => {
			expect(LibDecimal.from(1.5).toString()).toBe("1.5");
			expect(LibDecimal.from(100).toString()).toBe("100");
			expect(LibDecimal.from(0).toString()).toBe("0");
		});

		it("creates zero and one", () => {
			expect(LibDecimal.zero().toString()).toBe("0");
			expect(LibDecimal.one().toString()).toBe("1");
		});

		it("rejects empty string", () => {
			expect(() => LibDecimal.from("")).toThrow("empty string");
		});

		it("rejects NaN", () => {
			expect(() => LibDecimal.from(Number.NaN)).toThrow("invalid");
		});

		it("rejects Infinity", () => {
			expect(() => LibDecimal.from(Number.POSITIVE_INFINITY)).toThrow("invalid");
			expect(() => LibDecimal.from(Number.NEGATIVE_INFINITY)).toThrow("invalid");
		});
	});

	describe("arithmetic precision", () => {
		it("0.1 + 0.2 = 0.3 exactly", () => {
			const result = LibDecimal.from("0.1").add(LibDecimal.from("0.2"));
			expect(result.toString()).toBe("0.3");
		});

		it("adds correctly", () => {
			expect(LibDecimal.from("1.1").add(LibDecimal.from("2.2")).toString()).toBe("3.3");
		});

		it("subtracts correctly", () => {
			expect(LibDecimal.from("5.5").sub(LibDecimal.from("2.2")).toString()).toBe("3.3");
			expect(LibDecimal.from("1").sub(LibDecimal.from("1.5")).toString()).toBe("-0.5");
		});

		it("multiplies correctly", () => {
			expect(LibDecimal.from("3").mul(LibDecimal.from("4")).toString()).toBe("12");
			expect(LibDecimal.from("0.1").mul(LibDecimal.from("0.2")).toString()).toBe("0.02");
		});

		it("divides correctly", () => {
			expect(LibDecimal.from("10").div(LibDecimal.from("4")).toString()).toBe("2.5");
			expect(LibDecimal.from("1").div(LibDecimal.from("3")).toFixed(6)).toBe("0.333333");
		});
	});

	describe("edge cases", () => {
		it("handles very small values (18 decimal places)", () => {
			const tiny = LibDecimal.from("0.000000000000000001");
			expect(tiny.isPositive()).toBe(true);
			expect(tiny.add(tiny).toString()).toBe("0.000000000000000002");
		});

		it("handles very large values", () => {
			const large = LibDecimal.from("999999999999");
			expect(large.add(LibDecimal.one()).toString()).toBe("1000000000000");
		});

		it("negative zero behaves as zero", () => {
			const negZero = LibDecimal.from("0").neg();
			expect(negZero.isZero()).toBe(true);
			expect(negZero.toString()).toBe("0");
		});
	});

	describe("division by zero", () => {
		it("throws on division by zero", () => {
			expect(() => LibDecimal.from("1").div(LibDecimal.zero())).toThrow("division by zero");
		});
	});

	describe("comparison", () => {
		it("cmp returns -1, 0, or 1", () => {
			expect(LibDecimal.from("1").cmp(LibDecimal.from("2"))).toBe(-1);
			expect(LibDecimal.from("2").cmp(LibDecimal.from("2"))).toBe(0);
			expect(LibDecimal.from("3").cmp(LibDecimal.from("2"))).toBe(1);
		});

		it("isZero, isPositive, isNegative", () => {
			expect(LibDecimal.zero().isZero()).toBe(true);
			expect(LibDecimal.from("5").isPositive()).toBe(true);
			expect(LibDecimal.from("-5").isNegative()).toBe(true);
			expect(LibDecimal.from("5").isNegative()).toBe(false);
			expect(LibDecimal.from("-5").isPositive()).toBe(false);
		});

		it("eq, gt, gte, lt, lte", () => {
			const a = LibDecimal.from("1.5");
			const b = LibDecimal.from("2.5");
			const c = LibDecimal.from("1.5");

			expect(a.eq(c)).toBe(true);
			expect(a.eq(b)).toBe(false);
			expect(a.lt(b)).toBe(true);
			expect(b.gt(a)).toBe(true);
			expect(a.lte(c)).toBe(true);
			expect(b.gte(a)).toBe(true);
		});
	});

	describe("conversion", () => {
		it("toString strips trailing zeros", () => {
			expect(LibDecimal.from("1.50").toString()).toBe("1.5");
			expect(LibDecimal.from("2.00").toString()).toBe("2");
			expect(LibDecimal.from("0.10").toString()).toBe("0.1");
		});

		it("toFixed pads correctly", () => {
			expect(LibDecimal.from("1.23456").toFixed(2)).toBe("1.23");
			expect(LibDecimal.from("1.2").toFixed(4)).toBe("1.2000");
			expect(LibDecimal.from("1.23456").toFixed(0)).toBe("1");
		});

		it("toNumber round-trips for simple values", () => {
			expect(LibDecimal.from("1.5").toNumber()).toBe(1.5);
			expect(LibDecimal.from("-42").toNumber()).toBe(-42);
			expect(LibDecimal.from("0").toNumber()).toBe(0);
		});
	});

	describe("negation and abs", () => {
		it("neg flips sign", () => {
			expect(LibDecimal.from("5").neg().toString()).toBe("-5");
			expect(LibDecimal.from("-3").neg().toString()).toBe("3");
		});

		it("abs returns positive", () => {
			expect(LibDecimal.from("-5").abs().toString()).toBe("5");
			expect(LibDecimal.from("5").abs().toString()).toBe("5");
		});
	});
});
