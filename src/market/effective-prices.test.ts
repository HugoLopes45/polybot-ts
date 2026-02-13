import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { getEffectivePrices } from "./effective-prices.js";
import type { OrderbookSnapshot } from "./types.js";

const emptyBook: OrderbookSnapshot = {
	bids: [],
	asks: [],
	timestampMs: 0,
};

function level(price: number, size: number) {
	return { price: Decimal.from(price), size: Decimal.from(size) };
}

describe("getEffectivePrices", () => {
	describe("buyYes", () => {
		it("direct route cheaper than synthetic", () => {
			const yesBook: OrderbookSnapshot = {
				bids: [level(0.5, 10)],
				asks: [level(0.6, 10)],
				timestampMs: 0,
			};
			const noBook: OrderbookSnapshot = {
				bids: [level(0.4, 10)],
				asks: [level(0.5, 10)],
				timestampMs: 0,
			};
			const result = getEffectivePrices(yesBook, noBook);
			expect(result.buyYes?.toNumber()).toBeCloseTo(0.6);
		});

		it("synthetic route cheaper than direct", () => {
			const yesBook: OrderbookSnapshot = {
				bids: [level(0.7, 10)],
				asks: [level(0.8, 10)],
				timestampMs: 0,
			};
			const noBook: OrderbookSnapshot = {
				bids: [level(0.3, 10)],
				asks: [level(0.4, 10)],
				timestampMs: 0,
			};
			const result = getEffectivePrices(yesBook, noBook);
			expect(result.buyYes?.toNumber()).toBeCloseTo(0.7);
		});
	});

	describe("buyNo", () => {
		it("direct route cheaper than synthetic", () => {
			const yesBook: OrderbookSnapshot = {
				bids: [level(0.5, 10)],
				asks: [level(0.6, 10)],
				timestampMs: 0,
			};
			const noBook: OrderbookSnapshot = {
				bids: [level(0.4, 10)],
				asks: [level(0.5, 10)],
				timestampMs: 0,
			};
			const result = getEffectivePrices(yesBook, noBook);
			expect(result.buyNo?.toNumber()).toBeCloseTo(0.5);
		});

		it("synthetic route cheaper than direct", () => {
			const yesBook: OrderbookSnapshot = {
				bids: [level(0.3, 10)],
				asks: [level(0.4, 10)],
				timestampMs: 0,
			};
			const noBook: OrderbookSnapshot = {
				bids: [level(0.6, 10)],
				asks: [level(0.7, 10)],
				timestampMs: 0,
			};
			const result = getEffectivePrices(yesBook, noBook);
			expect(result.buyNo?.toNumber()).toBeCloseTo(0.7);
		});
	});

	describe("sellYes", () => {
		it("direct route better than synthetic", () => {
			const yesBook: OrderbookSnapshot = {
				bids: [level(0.6, 10)],
				asks: [level(0.7, 10)],
				timestampMs: 0,
			};
			const noBook: OrderbookSnapshot = {
				bids: [level(0.3, 10)],
				asks: [level(0.4, 10)],
				timestampMs: 0,
			};
			const result = getEffectivePrices(yesBook, noBook);
			expect(result.sellYes?.toNumber()).toBeCloseTo(0.6);
		});

		it("synthetic route better than direct", () => {
			const yesBook: OrderbookSnapshot = {
				bids: [level(0.4, 10)],
				asks: [level(0.5, 10)],
				timestampMs: 0,
			};
			const noBook: OrderbookSnapshot = {
				bids: [level(0.5, 10)],
				asks: [level(0.6, 10)],
				timestampMs: 0,
			};
			const result = getEffectivePrices(yesBook, noBook);
			expect(result.sellYes?.toNumber()).toBeCloseTo(0.4);
		});
	});

	describe("sellNo", () => {
		it("direct route better than synthetic", () => {
			const yesBook: OrderbookSnapshot = {
				bids: [level(0.5, 10)],
				asks: [level(0.6, 10)],
				timestampMs: 0,
			};
			const noBook: OrderbookSnapshot = {
				bids: [level(0.4, 10)],
				asks: [level(0.5, 10)],
				timestampMs: 0,
			};
			const result = getEffectivePrices(yesBook, noBook);
			expect(result.sellNo?.toNumber()).toBeCloseTo(0.4);
		});

		it("synthetic route better than direct", () => {
			const yesBook: OrderbookSnapshot = {
				bids: [level(0.6, 10)],
				asks: [level(0.7, 10)],
				timestampMs: 0,
			};
			const noBook: OrderbookSnapshot = {
				bids: [level(0.3, 10)],
				asks: [level(0.4, 10)],
				timestampMs: 0,
			};
			const result = getEffectivePrices(yesBook, noBook);
			expect(result.sellNo?.toNumber()).toBeCloseTo(0.3);
		});
	});

	describe("edge cases", () => {
		it("empty yes book uses mirror when available", () => {
			const noBook: OrderbookSnapshot = {
				bids: [level(0.4, 10)],
				asks: [level(0.5, 10)],
				timestampMs: 0,
			};
			const result = getEffectivePrices(emptyBook, noBook);
			expect(result.buyYes?.toNumber()).toBeCloseTo(0.6);
			expect(result.buyNo?.toNumber()).toBeCloseTo(0.5);
			expect(result.sellYes?.toNumber()).toBeCloseTo(0.5);
			expect(result.sellNo?.toNumber()).toBeCloseTo(0.4);
		});

		it("empty no book uses mirror when available", () => {
			const yesBook: OrderbookSnapshot = {
				bids: [level(0.5, 10)],
				asks: [level(0.6, 10)],
				timestampMs: 0,
			};
			const result = getEffectivePrices(yesBook, emptyBook);
			expect(result.buyYes?.toNumber()).toBeCloseTo(0.6);
			expect(result.buyNo?.toNumber()).toBeCloseTo(0.5);
			expect(result.sellYes?.toNumber()).toBeCloseTo(0.5);
			expect(result.sellNo?.toNumber()).toBeCloseTo(0.4);
		});

		it("both books empty returns null for all", () => {
			const result = getEffectivePrices(emptyBook, emptyBook);
			expect(result.buyYes).toBeNull();
			expect(result.buyNo).toBeNull();
			expect(result.sellYes).toBeNull();
			expect(result.sellNo).toBeNull();
		});

		it("one-sided book (bids only, no asks)", () => {
			const yesBook: OrderbookSnapshot = {
				bids: [level(0.5, 10)],
				asks: [],
				timestampMs: 0,
			};
			const noBook: OrderbookSnapshot = {
				bids: [level(0.4, 10)],
				asks: [level(0.5, 10)],
				timestampMs: 0,
			};
			const result = getEffectivePrices(yesBook, noBook);
			// buyYes: no direct ask, mirror = 1 - noBid = 0.6
			expect(result.buyYes?.toNumber()).toBeCloseTo(0.6);
			// sellYes: direct bid = 0.5, mirror = 1 - noAsk = 0.5 → max = 0.5
			expect(result.sellYes?.toNumber()).toBeCloseTo(0.5);
		});

		it("single-level books", () => {
			const yesBook: OrderbookSnapshot = {
				bids: [level(0.55, 100)],
				asks: [level(0.6, 100)],
				timestampMs: 0,
			};
			const noBook: OrderbookSnapshot = {
				bids: [level(0.35, 100)],
				asks: [level(0.4, 100)],
				timestampMs: 0,
			};
			const result = getEffectivePrices(yesBook, noBook);
			expect(result.buyYes?.toNumber()).toBeCloseTo(0.6);
			expect(result.buyNo?.toNumber()).toBeCloseTo(0.4);
			expect(result.sellYes?.toNumber()).toBeCloseTo(0.6);
			expect(result.sellNo?.toNumber()).toBeCloseTo(0.4);
		});
	});

	describe("mirror equivalence property", () => {
		it("buyYes ≈ 1 - sellNo", () => {
			const yesBook: OrderbookSnapshot = {
				bids: [level(0.4, 10)],
				asks: [level(0.6, 10)],
				timestampMs: 0,
			};
			const noBook: OrderbookSnapshot = {
				bids: [level(0.3, 10)],
				asks: [level(0.5, 10)],
				timestampMs: 0,
			};
			const result = getEffectivePrices(yesBook, noBook);
			const sellNo = result.sellNo;
			expect(sellNo).not.toBeNull();
			if (sellNo === null) throw new Error("sellNo is null");
			const oneMinusSellNo = Decimal.one().sub(sellNo);
			expect(result.buyYes?.eq(oneMinusSellNo)).toBe(true);
		});

		it("buyNo ≈ 1 - sellYes", () => {
			const yesBook: OrderbookSnapshot = {
				bids: [level(0.4, 10)],
				asks: [level(0.6, 10)],
				timestampMs: 0,
			};
			const noBook: OrderbookSnapshot = {
				bids: [level(0.3, 10)],
				asks: [level(0.5, 10)],
				timestampMs: 0,
			};
			const result = getEffectivePrices(yesBook, noBook);
			const sellYes = result.sellYes;
			expect(sellYes).not.toBeNull();
			if (sellYes === null) throw new Error("sellYes is null");
			const oneMinusSellYes = Decimal.one().sub(sellYes);
			expect(result.buyNo?.eq(oneMinusSellYes)).toBe(true);
		});
	});

	describe("negative mirror clamp", () => {
		it("noBid > 1 does not produce negative buyYes", () => {
			const yesBook: OrderbookSnapshot = {
				bids: [],
				asks: [],
				timestampMs: 0,
			};
			const noBook: OrderbookSnapshot = {
				bids: [level(1.05, 10)],
				asks: [],
				timestampMs: 0,
			};
			const result = getEffectivePrices(yesBook, noBook);
			// mirror = 1 - 1.05 = -0.05, should clamp to 0
			expect(result.buyYes).not.toBeNull();
			expect(result.buyYes?.toNumber()).toBeGreaterThanOrEqual(0);
			expect(result.buyYes?.toNumber()).toBe(0);
		});

		it("noAsk > 1 does not produce negative sellYes mirror", () => {
			const yesBook: OrderbookSnapshot = {
				bids: [],
				asks: [],
				timestampMs: 0,
			};
			const noBook: OrderbookSnapshot = {
				bids: [],
				asks: [level(1.1, 10)],
				timestampMs: 0,
			};
			const result = getEffectivePrices(yesBook, noBook);
			// mirror = 1 - 1.10 = -0.10, should clamp to 0
			expect(result.sellYes).not.toBeNull();
			expect(result.sellYes?.toNumber()).toBeGreaterThanOrEqual(0);
		});

		it("yesBid > 1 does not produce negative buyNo mirror", () => {
			const yesBook: OrderbookSnapshot = {
				bids: [level(1.02, 10)],
				asks: [],
				timestampMs: 0,
			};
			const noBook: OrderbookSnapshot = {
				bids: [],
				asks: [],
				timestampMs: 0,
			};
			const result = getEffectivePrices(yesBook, noBook);
			// mirror = 1 - 1.02 = -0.02, should clamp to 0
			expect(result.buyNo).not.toBeNull();
			expect(result.buyNo?.toNumber()).toBeGreaterThanOrEqual(0);
		});

		it("mirror values above 1 are clamped to 1", () => {
			// noBid = -0.5 (unusual but technically possible) → mirror = 1 - (-0.5) = 1.5
			const yesBook: OrderbookSnapshot = {
				bids: [],
				asks: [],
				timestampMs: 0,
			};
			const noBook: OrderbookSnapshot = {
				bids: [level(0, 10)],
				asks: [],
				timestampMs: 0,
			};
			const result = getEffectivePrices(yesBook, noBook);
			// mirror = 1 - 0 = 1, should be clamped at 1
			expect(result.buyYes?.toNumber()).toBeLessThanOrEqual(1);
		});
	});

	describe("boundary prices", () => {
		it("handles boundary prices with partial liquidity", () => {
			const yesBook: OrderbookSnapshot = {
				bids: [level(0.5, 10)],
				asks: [level(0.7, 10)],
				timestampMs: 0,
			};
			const noBook: OrderbookSnapshot = {
				bids: [level(0.2, 10)],
				asks: [level(0.4, 10)],
				timestampMs: 0,
			};
			const result = getEffectivePrices(yesBook, noBook);
			expect(result.buyYes?.toNumber()).toBeCloseTo(0.7);
			expect(result.sellNo?.toNumber()).toBeCloseTo(0.3);
		});

		it("handles when direct price is at 0 or 1", () => {
			const yesBook: OrderbookSnapshot = {
				bids: [level(0.01, 10)],
				asks: [level(0.99, 10)],
				timestampMs: 0,
			};
			const noBook: OrderbookSnapshot = {
				bids: [level(0.01, 10)],
				asks: [level(0.99, 10)],
				timestampMs: 0,
			};
			const result = getEffectivePrices(yesBook, noBook);
			expect(result.buyYes?.toNumber()).toBeCloseTo(0.99);
			expect(result.buyNo?.toNumber()).toBeCloseTo(0.99);
			expect(result.sellYes?.toNumber()).toBeCloseTo(0.01);
			expect(result.sellNo?.toNumber()).toBeCloseTo(0.01);
		});
	});
});
