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
