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

	describe("sqrt", () => {
		it("sqrt(4) = 2", () => {
			expect(LibDecimal.from("4").sqrt().toString()).toBe("2");
		});

		it("sqrt(0) = 0", () => {
			expect(LibDecimal.from("0").sqrt().toString()).toBe("0");
		});

		it("sqrt(1) = 1", () => {
			expect(LibDecimal.from("1").sqrt().toString()).toBe("1");
		});

		it("sqrt(2) ≈ 1.4142", () => {
			const s = LibDecimal.from("2").sqrt();
			expect(Math.abs(s.toNumber() - Math.SQRT2)).toBeLessThan(1e-10);
		});

		it("sqrt(0.25) = 0.5", () => {
			const s = LibDecimal.from("0.25").sqrt();
			expect(Math.abs(s.toNumber() - 0.5)).toBeLessThan(1e-10);
		});

		it("throws on negative input", () => {
			expect(() => LibDecimal.from("-1").sqrt()).toThrow("sqrt of negative");
		});
	});

	describe("ln", () => {
		it("ln(1) = 0", () => {
			expect(LibDecimal.from("1").ln().toString()).toBe("0");
		});

		it("ln(e) ≈ 1", () => {
			const lnE = LibDecimal.from(Math.E).ln();
			expect(Math.abs(lnE.toNumber() - 1)).toBeLessThan(1e-10);
		});

		it("ln(0.5) ≈ -0.6931", () => {
			const val = LibDecimal.from("0.5").ln();
			expect(Math.abs(val.toNumber() - Math.log(0.5))).toBeLessThan(1e-10);
		});

		it("throws on zero", () => {
			expect(() => LibDecimal.from("0").ln()).toThrow("ln of non-positive");
		});

		it("throws on negative", () => {
			expect(() => LibDecimal.from("-1").ln()).toThrow("ln of non-positive");
		});
	});

	describe("exp", () => {
		it("exp(0) = 1", () => {
			expect(LibDecimal.from("0").exp().toString()).toBe("1");
		});

		it("exp(1) ≈ e", () => {
			const e = LibDecimal.from("1").exp();
			expect(Math.abs(e.toNumber() - Math.E)).toBeLessThan(1e-10);
		});

		it("exp(-1) ≈ 1/e", () => {
			const val = LibDecimal.from("-1").exp();
			expect(Math.abs(val.toNumber() - 1 / Math.E)).toBeLessThan(1e-10);
		});
	});

	describe("pow", () => {
		it("2^3 = 8", () => {
			expect(LibDecimal.from("2").pow(3).toString()).toBe("8");
		});

		it("4^0.5 = 2 (same as sqrt)", () => {
			const val = LibDecimal.from("4").pow(0.5);
			expect(Math.abs(val.toNumber() - 2)).toBeLessThan(1e-10);
		});

		it("x^0 = 1", () => {
			expect(LibDecimal.from("42").pow(0).toString()).toBe("1");
		});

		it("x^1 = x", () => {
			expect(LibDecimal.from("3.14").pow(1).toFixed(2)).toBe("3.14");
		});

		it("0^2 = 0", () => {
			expect(LibDecimal.from("0").pow(2).toString()).toBe("0");
		});
	});
});
