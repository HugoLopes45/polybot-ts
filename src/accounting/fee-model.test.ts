import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { computeFee, fixedNotionalFee, noFees, profitBasedFee } from "./fee-model.js";

const d = Decimal.from;

describe("FeeModel", () => {
	describe("noFees", () => {
		it("returns zero fee", () => {
			const model = noFees();
			expect(computeFee(model, d("100"), d("10")).isZero()).toBe(true);
		});
	});

	describe("fixedNotionalFee", () => {
		it("charges bps of notional (10 bps = 0.1%)", () => {
			const model = fixedNotionalFee(10);
			const fee = computeFee(model, d("1000"), d("50"));
			expect(fee.eq(d("1"))).toBe(true);
		});

		it("charges zero on zero notional", () => {
			const model = fixedNotionalFee(10);
			expect(computeFee(model, d("0"), d("10")).isZero()).toBe(true);
		});
	});

	describe("profitBasedFee", () => {
		it("charges percentage of profit when positive", () => {
			const model = profitBasedFee(2);
			const fee = computeFee(model, d("1000"), d("100"));
			expect(fee.eq(d("2"))).toBe(true);
		});

		it("charges zero when P&L is negative", () => {
			const model = profitBasedFee(2);
			expect(computeFee(model, d("1000"), d("-50")).isZero()).toBe(true);
		});

		it("charges zero when P&L is zero", () => {
			const model = profitBasedFee(2);
			expect(computeFee(model, d("1000"), d("0")).isZero()).toBe(true);
		});
	});

	describe("fixedNotionalFee edge cases", () => {
		it("uses absolute notional to prevent negative fees (BUG-2)", () => {
			const model = fixedNotionalFee(10);
			const fee = computeFee(model, d("-1000"), d("50"));
			expect(fee.isNegative()).toBe(false);
			expect(fee.eq(d("1"))).toBe(true);
		});
	});

	describe("float division precision (BUG-7)", () => {
		it("fixedNotionalFee(3) on $1M notional is exactly $300", () => {
			const model = fixedNotionalFee(3);
			const fee = computeFee(model, d("1000000"), d("0"));
			expect(fee.eq(d("300"))).toBe(true);
		});

		it("profitBasedFee(7) on $1000 pnl is exactly $70", () => {
			const model = profitBasedFee(7);
			const fee = computeFee(model, d("0"), d("1000"));
			expect(fee.eq(d("70"))).toBe(true);
		});
	});

	describe("profitBasedFee rounding (HARD-8)", () => {
		it("handles very small pnl values", () => {
			const model = profitBasedFee(33);
			const fee = computeFee(model, d("100"), d("0.01"));
			expect(fee.isPositive()).toBe(true);
			expect(fee.isNegative()).toBe(false);
		});
	});

	describe("fee result is always non-negative", () => {
		it.each([
			["noFees", noFees()],
			["fixed 10bps", fixedNotionalFee(10)],
			["profit 2%", profitBasedFee(2)],
		] as const)("%s never returns negative", (_, model) => {
			const fee = computeFee(model, d("1000"), d("-100"));
			expect(fee.isNegative()).toBe(false);
		});
	});
});
