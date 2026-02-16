import { describe, expect, it } from "vitest";
import { Decimal } from "./decimal.js";

describe("Decimal", () => {
	describe("factory methods", () => {
		it("creates from string", () => {
			expect(Decimal.from("1.5").toString()).toBe("1.5");
			expect(Decimal.from("100").toString()).toBe("100");
			expect(Decimal.from("0.001").toString()).toBe("0.001");
		});

		it("creates from number", () => {
			expect(Decimal.from(1.5).toString()).toBe("1.5");
			expect(Decimal.from(100).toString()).toBe("100");
			expect(Decimal.from(0).toString()).toBe("0");
		});

		it("creates negative values", () => {
			expect(Decimal.from("-1.5").toString()).toBe("-1.5");
			expect(Decimal.from(-42).toString()).toBe("-42");
		});

		it("zero and one constants", () => {
			expect(Decimal.zero().toString()).toBe("0");
			expect(Decimal.one().toString()).toBe("1");
		});

		it("rejects invalid inputs", () => {
			expect(() => Decimal.from("")).toThrow("empty string");
			expect(() => Decimal.from(Number.NaN)).toThrow("invalid number");
			expect(() => Decimal.from(Number.POSITIVE_INFINITY)).toThrow("invalid number");
		});
	});

	describe("arithmetic", () => {
		it("adds correctly", () => {
			expect(Decimal.from("1.1").add(Decimal.from("2.2")).toString()).toBe("3.3");
			expect(Decimal.from("0.1").add(Decimal.from("0.2")).toString()).toBe("0.3");
		});

		it("subtracts correctly", () => {
			expect(Decimal.from("5.5").sub(Decimal.from("2.2")).toString()).toBe("3.3");
			expect(Decimal.from("1").sub(Decimal.from("1.5")).toString()).toBe("-0.5");
		});

		it("multiplies correctly", () => {
			expect(Decimal.from("3").mul(Decimal.from("4")).toString()).toBe("12");
			expect(Decimal.from("0.1").mul(Decimal.from("0.2")).toString()).toBe("0.02");
		});

		it("divides correctly", () => {
			expect(Decimal.from("10").div(Decimal.from("4")).toString()).toBe("2.5");
			expect(Decimal.from("1").div(Decimal.from("3")).toFixed(6)).toBe("0.333333");
		});

		it("throws on division by zero", () => {
			expect(() => Decimal.from("1").div(Decimal.zero())).toThrow("division by zero");
		});

		it("negates correctly", () => {
			expect(Decimal.from("5").neg().toString()).toBe("-5");
			expect(Decimal.from("-3").neg().toString()).toBe("3");
		});

		it("absolute value", () => {
			expect(Decimal.from("-5").abs().toString()).toBe("5");
			expect(Decimal.from("5").abs().toString()).toBe("5");
		});
	});

	describe("comparison", () => {
		const a = Decimal.from("1.5");
		const b = Decimal.from("2.5");
		const c = Decimal.from("1.5");

		it("equality", () => {
			expect(a.eq(c)).toBe(true);
			expect(a.eq(b)).toBe(false);
		});

		it("ordering", () => {
			expect(a.lt(b)).toBe(true);
			expect(b.gt(a)).toBe(true);
			expect(a.lte(c)).toBe(true);
			expect(b.gte(a)).toBe(true);
		});

		it("sign checks", () => {
			expect(Decimal.zero().isZero()).toBe(true);
			expect(Decimal.from("1").isPositive()).toBe(true);
			expect(Decimal.from("-1").isNegative()).toBe(true);
		});
	});

	describe("min / max", () => {
		it("returns minimum", () => {
			expect(Decimal.min(Decimal.from("3"), Decimal.from("1")).toString()).toBe("1");
		});

		it("returns maximum", () => {
			expect(Decimal.max(Decimal.from("3"), Decimal.from("1")).toString()).toBe("3");
		});
	});

	describe("conversion", () => {
		it("toNumber round-trips for simple values", () => {
			expect(Decimal.from("1.5").toNumber()).toBe(1.5);
			expect(Decimal.from("-42").toNumber()).toBe(-42);
			expect(Decimal.from("0").toNumber()).toBe(0);
		});

		it("toFixed formats correctly", () => {
			expect(Decimal.from("1.23456").toFixed(2)).toBe("1.23");
			expect(Decimal.from("1.23456").toFixed(0)).toBe("1");
			expect(Decimal.from("1.2").toFixed(4)).toBe("1.2000");
		});
	});

	describe("toFixed rounding behavior (HARD-11)", () => {
		it("uses ROUND_HALF_UP at midpoint", () => {
			// decimal.js-light default rounding mode 4 = ROUND_HALF_UP
			expect(Decimal.from("1.235").toFixed(2)).toBe("1.24");
			expect(Decimal.from("1.245").toFixed(2)).toBe("1.25");
			expect(Decimal.from("1.225").toFixed(2)).toBe("1.23");
		});

		it("truncates correctly for financial values", () => {
			expect(Decimal.from("0.999").toFixed(2)).toBe("1.00");
			expect(Decimal.from("0.001").toFixed(2)).toBe("0.00");
		});
	});

	describe("division precision (HARD-12)", () => {
		it("1/3 produces consistent output", () => {
			const result = Decimal.from("1").div(Decimal.from("3"));
			const str = result.toString();
			// Should be 0.33333... with a consistent length
			expect(str.startsWith("0.3333")).toBe(true);
		});

		it("1/7 produces a repeating decimal", () => {
			const result = Decimal.from("1").div(Decimal.from("7"));
			const fixed = result.toFixed(6);
			expect(fixed).toBe("0.142857");
		});
	});

	describe("sqrt / ln / exp / pow", () => {
		it("sqrt(4) = 2", () => {
			expect(Decimal.from(4).sqrt().toString()).toBe("2");
		});

		it("sqrt(0) = 0", () => {
			expect(Decimal.from(0).sqrt().toString()).toBe("0");
		});

		it("sqrt(0.25) ≈ 0.5", () => {
			expect(Math.abs(Decimal.from("0.25").sqrt().toNumber() - 0.5)).toBeLessThan(1e-10);
		});

		it("sqrt throws on negative", () => {
			expect(() => Decimal.from(-1).sqrt()).toThrow("sqrt of negative");
		});

		it("ln(1) = 0", () => {
			expect(Decimal.from(1).ln().toString()).toBe("0");
		});

		it("ln(e) ≈ 1", () => {
			expect(Math.abs(Decimal.from(Math.E).ln().toNumber() - 1)).toBeLessThan(1e-10);
		});

		it("ln throws on zero", () => {
			expect(() => Decimal.from(0).ln()).toThrow("ln of non-positive");
		});

		it("exp(0) = 1", () => {
			expect(Decimal.from(0).exp().toString()).toBe("1");
		});

		it("exp(1) ≈ e", () => {
			expect(Math.abs(Decimal.from(1).exp().toNumber() - Math.E)).toBeLessThan(1e-10);
		});

		it("pow(2, 3) = 8", () => {
			expect(Decimal.from(2).pow(3).toString()).toBe("8");
		});

		it("pow(x, 0) = 1", () => {
			expect(Decimal.from(42).pow(0).toString()).toBe("1");
		});
	});

	describe("financial precision (IEEE 754 edge cases)", () => {
		it("0.1 + 0.2 === 0.3 (unlike native floats)", () => {
			const result = Decimal.from("0.1").add(Decimal.from("0.2"));
			expect(result.eq(Decimal.from("0.3"))).toBe(true);
		});

		it("handles very small values", () => {
			const tiny = Decimal.from("0.000000000000000001");
			expect(tiny.isPositive()).toBe(true);
			expect(tiny.add(tiny).toString()).toBe("0.000000000000000002");
		});

		it("handles values near $1 (prediction market prices)", () => {
			const yes = Decimal.from("0.65");
			const no = Decimal.from("0.35");
			expect(yes.add(no).eq(Decimal.one())).toBe(true);
		});
	});
});
