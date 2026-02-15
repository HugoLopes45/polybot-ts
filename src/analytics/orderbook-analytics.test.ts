import { describe, expect, it } from "vitest";
import type { OrderbookSnapshot } from "../market/types.js";
import { Decimal } from "../shared/decimal.js";
import {
	calcBookDepth,
	calcImbalanceRatio,
	calcSpreadBps,
	calcVWAP,
	estimateSlippage,
} from "./orderbook-analytics.js";

const makeBook = (bids: [number, number][], asks: [number, number][]): OrderbookSnapshot => ({
	bids: bids.map(([price, size]) => ({
		price: Decimal.from(price),
		size: Decimal.from(size),
	})),
	asks: asks.map(([price, size]) => ({
		price: Decimal.from(price),
		size: Decimal.from(size),
	})),
	timestampMs: 1000,
});

const emptyBook: OrderbookSnapshot = { bids: [], asks: [], timestampMs: 1000 };

describe("calcImbalanceRatio", () => {
	it("returns ~1 for balanced book", () => {
		const book = makeBook([[0.5, 100]], [[0.51, 100]]);
		const ratio = calcImbalanceRatio(book);
		expect(ratio.toNumber()).toBeCloseTo(1.0, 5);
	});

	it("returns > 1 when bid side is heavier", () => {
		const book = makeBook([[0.5, 200]], [[0.51, 100]]);
		expect(calcImbalanceRatio(book).toNumber()).toBeCloseTo(2.0, 5);
	});

	it("returns < 1 when ask side is heavier", () => {
		const book = makeBook([[0.5, 50]], [[0.51, 100]]);
		expect(calcImbalanceRatio(book).toNumber()).toBeCloseTo(0.5, 5);
	});

	it("returns zero for empty book", () => {
		expect(calcImbalanceRatio(emptyBook).isZero()).toBe(true);
	});

	it("respects depthLevels parameter", () => {
		const book = makeBook(
			[
				[0.5, 100],
				[0.49, 500],
			],
			[
				[0.51, 100],
				[0.52, 500],
			],
		);
		// Only first level: 100/100 = 1
		expect(calcImbalanceRatio(book, 1).toNumber()).toBeCloseTo(1.0, 5);
		// Both levels: 600/600 = 1
		expect(calcImbalanceRatio(book, 2).toNumber()).toBeCloseTo(1.0, 5);
	});
});

describe("calcVWAP", () => {
	it("calculates VWAP for known trades", () => {
		const trades = [
			{ price: Decimal.from("10"), size: Decimal.from("100") },
			{ price: Decimal.from("11"), size: Decimal.from("200") },
		];
		// VWAP = (10*100 + 11*200) / (100+200) = 3200/300 = 10.666...
		const vwap = calcVWAP(trades);
		expect(vwap).not.toBeNull();
		expect(vwap?.toNumber()).toBeCloseTo(10.6667, 3);
	});

	it("returns null for empty trades", () => {
		expect(calcVWAP([])).toBeNull();
	});

	it("returns trade price for single trade", () => {
		const trades = [{ price: Decimal.from("50"), size: Decimal.from("10") }];
		expect(calcVWAP(trades)?.toString()).toBe("50");
	});
});

describe("calcSpreadBps", () => {
	it("calculates spread in basis points", () => {
		// bestBid=0.50, bestAsk=0.51
		// spread = 0.01, mid = 0.505
		// bps = 0.01/0.505 * 10000 ~ 198.02
		const book = makeBook([[0.5, 100]], [[0.51, 100]]);
		const spread = calcSpreadBps(book);
		expect(spread).not.toBeNull();
		expect(spread?.toNumber()).toBeCloseTo(198.02, 0);
	});

	it("returns null for empty book", () => {
		expect(calcSpreadBps(emptyBook)).toBeNull();
	});

	it("returns null for single-sided book", () => {
		const bidOnly = makeBook([[0.5, 100]], []);
		expect(calcSpreadBps(bidOnly)).toBeNull();
		const askOnly = makeBook([], [[0.51, 100]]);
		expect(calcSpreadBps(askOnly)).toBeNull();
	});
});

describe("estimateSlippage", () => {
	it("returns zero slippage for small order within first level", () => {
		const book = makeBook([[0.5, 1000]], [[0.51, 1000]]);
		const slippage = estimateSlippage(book, "buy", Decimal.from("10"));
		expect(slippage.isZero()).toBe(true);
	});

	it("returns positive slippage for order spanning levels", () => {
		const book = makeBook(
			[[0.5, 100]],
			[
				[0.51, 50],
				[0.52, 50],
				[0.53, 100],
			],
		);
		// Buy 100: 50@0.51 + 50@0.52 = VWAP 0.515
		// Slippage = 0.515 - 0.51 = 0.005
		const slippage = estimateSlippage(book, "buy", Decimal.from("100"));
		expect(slippage.toNumber()).toBeCloseTo(0.005, 5);
	});

	it("uses all available depth for oversized order", () => {
		const book = makeBook([[0.5, 100]], [[0.51, 50]]);
		// Buy 200 but only 50 available
		const slippage = estimateSlippage(book, "buy", Decimal.from("200"));
		expect(slippage.isZero()).toBe(true); // all at same price
	});
});

describe("calcBookDepth", () => {
	it("sums total size on buy side (asks)", () => {
		const book = makeBook(
			[],
			[
				[0.51, 100],
				[0.52, 200],
				[0.53, 300],
			],
		);
		expect(calcBookDepth(book, "buy").toString()).toBe("600");
	});

	it("sums total size on sell side (bids)", () => {
		const book = makeBook(
			[
				[0.5, 100],
				[0.49, 200],
			],
			[],
		);
		expect(calcBookDepth(book, "sell").toString()).toBe("300");
	});

	it("respects priceLevels limit", () => {
		const book = makeBook(
			[],
			[
				[0.51, 100],
				[0.52, 200],
				[0.53, 300],
			],
		);
		expect(calcBookDepth(book, "buy", 2).toString()).toBe("300");
	});

	it("returns zero for empty book", () => {
		expect(calcBookDepth(emptyBook, "buy").isZero()).toBe(true);
	});
});
