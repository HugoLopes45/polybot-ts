import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { applyDelta, bestAsk, bestBid, effectivePrice, midPrice, spread } from "./orderbook.js";
import type { OrderbookLevel, OrderbookSnapshot } from "./types.js";

function level(price: string, size: string): OrderbookLevel {
	return { price: Decimal.from(price), size: Decimal.from(size) };
}

function emptyBook(timestampMs = 0): OrderbookSnapshot {
	return { bids: [], asks: [], timestampMs };
}

describe("orderbook", () => {
	describe("applyDelta", () => {
		it("adds new bid levels to an empty book", () => {
			const book = emptyBook();
			const delta = { bids: [level("0.50", "100"), level("0.45", "200")], asks: [] };

			const result = applyDelta(book, delta);

			expect(result.bids).toHaveLength(2);
			expect(result.bids[0]?.price.toString()).toBe("0.5");
			expect(result.bids[0]?.size.toString()).toBe("100");
		});

		it("adds new ask levels to an empty book", () => {
			const book = emptyBook();
			const delta = { bids: [], asks: [level("0.55", "150"), level("0.60", "300")] };

			const result = applyDelta(book, delta);

			expect(result.asks).toHaveLength(2);
			expect(result.asks[0]?.price.toString()).toBe("0.55");
			expect(result.asks[0]?.size.toString()).toBe("150");
		});

		it("removes a level when delta size is zero", () => {
			const book: OrderbookSnapshot = {
				bids: [level("0.50", "100")],
				asks: [],
				timestampMs: 0,
			};
			const delta = { bids: [level("0.50", "0")], asks: [] };

			const result = applyDelta(book, delta);

			expect(result.bids).toHaveLength(0);
		});

		it("updates existing level size at same price", () => {
			const book: OrderbookSnapshot = {
				bids: [level("0.50", "100")],
				asks: [],
				timestampMs: 0,
			};
			const delta = { bids: [level("0.50", "250")], asks: [] };

			const result = applyDelta(book, delta);

			expect(result.bids).toHaveLength(1);
			expect(result.bids[0]?.size.toString()).toBe("250");
		});

		it("maintains bids sorted descending by price", () => {
			const book = emptyBook();
			const delta = {
				bids: [level("0.30", "10"), level("0.50", "20"), level("0.40", "30")],
				asks: [],
			};

			const result = applyDelta(book, delta);

			expect(result.bids.map((l) => l.price.toString())).toEqual(["0.5", "0.4", "0.3"]);
		});

		it("maintains asks sorted ascending by price", () => {
			const book = emptyBook();
			const delta = {
				bids: [],
				asks: [level("0.70", "10"), level("0.55", "20"), level("0.60", "30")],
			};

			const result = applyDelta(book, delta);

			expect(result.asks.map((l) => l.price.toString())).toEqual(["0.55", "0.6", "0.7"]);
		});
	});

	describe("bestBid", () => {
		it("returns highest bid price", () => {
			const book: OrderbookSnapshot = {
				bids: [level("0.50", "100"), level("0.45", "200")],
				asks: [],
				timestampMs: 0,
			};

			const result = bestBid(book);

			expect(result).not.toBeNull();
			expect(result?.toString()).toBe("0.5");
		});

		it("returns null for empty book", () => {
			expect(bestBid(emptyBook())).toBeNull();
		});
	});

	describe("bestAsk", () => {
		it("returns lowest ask price", () => {
			const book: OrderbookSnapshot = {
				bids: [],
				asks: [level("0.55", "100"), level("0.60", "200")],
				timestampMs: 0,
			};

			const result = bestAsk(book);

			expect(result).not.toBeNull();
			expect(result?.toString()).toBe("0.55");
		});
	});

	describe("spread", () => {
		it("returns bestAsk minus bestBid", () => {
			const book: OrderbookSnapshot = {
				bids: [level("0.48", "100")],
				asks: [level("0.52", "100")],
				timestampMs: 0,
			};

			const result = spread(book);

			expect(result).not.toBeNull();
			expect(result?.toString()).toBe("0.04");
		});

		it("returns null when either side is empty", () => {
			expect(spread(emptyBook())).toBeNull();
			expect(spread({ bids: [level("0.50", "100")], asks: [], timestampMs: 0 })).toBeNull();
			expect(spread({ bids: [], asks: [level("0.55", "100")], timestampMs: 0 })).toBeNull();
		});
	});

	describe("midPrice", () => {
		it("returns average of bestBid and bestAsk", () => {
			const book: OrderbookSnapshot = {
				bids: [level("0.48", "100")],
				asks: [level("0.52", "100")],
				timestampMs: 0,
			};

			const result = midPrice(book);

			expect(result).not.toBeNull();
			expect(result?.toString()).toBe("0.5");
		});
	});

	describe("crossed book", () => {
		it("spread returns negative when bestBid > bestAsk", () => {
			const book: OrderbookSnapshot = {
				bids: [level("0.55", "100")],
				asks: [level("0.50", "100")],
				timestampMs: 0,
			};

			const result = spread(book);
			expect(result).not.toBeNull();
			expect(result?.isNegative()).toBe(true);
			expect(result?.toString()).toBe("-0.05");
		});
	});

	describe("effectivePrice", () => {
		it("for buy walks asks up to requested size", () => {
			const book: OrderbookSnapshot = {
				bids: [],
				asks: [level("0.55", "100"), level("0.60", "200")],
				timestampMs: 0,
			};

			const result = effectivePrice(book, Decimal.from("150"), "buy");

			// 100 * 0.55 + 50 * 0.60 = 55 + 30 = 85 / 150 = 0.5666...
			expect(result).not.toBeNull();
			expect(result?.toFixed(4)).toBe("0.5667");
		});

		it("returns null when insufficient depth", () => {
			const book: OrderbookSnapshot = {
				bids: [],
				asks: [level("0.55", "50")],
				timestampMs: 0,
			};

			const result = effectivePrice(book, Decimal.from("100"), "buy");

			expect(result).toBeNull();
		});

		it("returns null when size is zero (division by zero guard)", () => {
			const book: OrderbookSnapshot = {
				bids: [level("0.50", "100")],
				asks: [level("0.55", "200")],
				timestampMs: 0,
			};

			expect(effectivePrice(book, Decimal.zero(), "buy")).toBeNull();
			expect(effectivePrice(book, Decimal.zero(), "sell")).toBeNull();
		});

		it("for sell walks bids", () => {
			const book: OrderbookSnapshot = {
				bids: [level("0.50", "100"), level("0.45", "200")],
				asks: [],
				timestampMs: 0,
			};

			const result = effectivePrice(book, Decimal.from("150"), "sell");

			// 100 * 0.50 + 50 * 0.45 = 50 + 22.5 = 72.5 / 150 = 0.4833...
			expect(result).not.toBeNull();
			expect(result?.toFixed(4)).toBe("0.4833");
		});
	});
});
