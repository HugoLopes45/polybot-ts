import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { CostBasis } from "./cost-basis.js";

describe("CostBasis", () => {
	describe("construction", () => {
		it("starts empty with zero totals", () => {
			const cb = CostBasis.create();
			expect(cb.totalCost().isZero()).toBe(true);
			expect(cb.totalSize().isZero()).toBe(true);
			expect(cb.fillCount()).toBe(0);
		});
	});

	describe("addFill", () => {
		it("tracks a single fill", () => {
			const cb = CostBasis.create().addFill({
				price: Decimal.from("0.50"),
				size: Decimal.from("100"),
				timestampMs: 1000,
			});

			expect(cb.totalSize().eq(Decimal.from("100"))).toBe(true);
			expect(cb.totalCost().eq(Decimal.from("50"))).toBe(true);
			expect(cb.fillCount()).toBe(1);
		});

		it("tracks multiple fills and accumulates", () => {
			const cb = CostBasis.create()
				.addFill({ price: Decimal.from("0.50"), size: Decimal.from("100"), timestampMs: 1000 })
				.addFill({ price: Decimal.from("0.60"), size: Decimal.from("50"), timestampMs: 2000 });

			expect(cb.totalSize().eq(Decimal.from("150"))).toBe(true);
			expect(cb.fillCount()).toBe(2);
		});

		it("is immutable — original unchanged", () => {
			const cb1 = CostBasis.create();
			const cb2 = cb1.addFill({
				price: Decimal.from("0.50"),
				size: Decimal.from("100"),
				timestampMs: 1000,
			});
			expect(cb1.fillCount()).toBe(0);
			expect(cb2.fillCount()).toBe(1);
		});
	});

	describe("weightedAvgPrice", () => {
		it("returns null when empty", () => {
			expect(CostBasis.create().weightedAvgPrice()).toBeNull();
		});

		it("returns fill price for a single fill", () => {
			const cb = CostBasis.create().addFill({
				price: Decimal.from("0.50"),
				size: Decimal.from("100"),
				timestampMs: 1000,
			});
			const avg = cb.weightedAvgPrice();
			expect(avg).not.toBeNull();
			expect(avg?.eq(Decimal.from("0.50"))).toBe(true);
		});

		it("computes weighted average for multiple fills", () => {
			const cb = CostBasis.create()
				.addFill({ price: Decimal.from("0.40"), size: Decimal.from("100"), timestampMs: 1000 })
				.addFill({ price: Decimal.from("0.60"), size: Decimal.from("100"), timestampMs: 2000 });

			const avg = cb.weightedAvgPrice();
			expect(avg).not.toBeNull();
			expect(avg?.eq(Decimal.from("0.50"))).toBe(true);
		});
	});

	describe("negative price/size handling (HARD-13)", () => {
		it("computes negative total cost for negative price (no validation)", () => {
			// Documents current behavior: CostBasis doesn't validate inputs
			const cb = CostBasis.create().addFill({
				price: Decimal.from("-1"),
				size: Decimal.from("5"),
				timestampMs: 1000,
			});
			// Documents that cost = -1 * 5 = -5
			expect(cb.totalCost().isNegative()).toBe(true);
			expect(cb.totalSize().eq(Decimal.from("5"))).toBe(true);
		});

		it("accumulates correctly with mixed-sign prices", () => {
			const cb = CostBasis.create()
				.addFill({ price: Decimal.from("10"), size: Decimal.from("5"), timestampMs: 1000 })
				.addFill({ price: Decimal.from("-2"), size: Decimal.from("3"), timestampMs: 2000 });
			// total cost = 10*5 + (-2)*3 = 50 - 6 = 44
			expect(cb.totalCost().eq(Decimal.from("44"))).toBe(true);
			expect(cb.totalSize().eq(Decimal.from("8"))).toBe(true);
		});
	});

	describe("allFills", () => {
		it("returns empty array for new instance", () => {
			expect(CostBasis.create().allFills().length).toBe(0);
		});

		it("returns all fill records in order", () => {
			const cb = CostBasis.create()
				.addFill({ price: Decimal.from("0.40"), size: Decimal.from("100"), timestampMs: 1000 })
				.addFill({ price: Decimal.from("0.60"), size: Decimal.from("50"), timestampMs: 2000 });

			const fills = cb.allFills();
			expect(fills.length).toBe(2);
			expect(fills[0]?.price.eq(Decimal.from("0.40"))).toBe(true);
			expect(fills[0]?.timestampMs).toBe(1000);
			expect(fills[1]?.price.eq(Decimal.from("0.60"))).toBe(true);
			expect(fills[1]?.size.eq(Decimal.from("50"))).toBe(true);
		});
	});
});
