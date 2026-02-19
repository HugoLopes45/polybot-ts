import { bench, describe } from "vitest";
import {
	calcBookDepth,
	calcImbalanceRatio,
	calcSpreadBps,
	estimateSlippage,
} from "../src/analytics/orderbook-analytics.js";
import type { OrderbookSnapshot } from "../src/market/types.js";
import { Decimal } from "../src/shared/decimal.js";

function buildBook(levels: number): OrderbookSnapshot {
	const bids = [];
	const asks = [];
	for (let i = 0; i < levels; i++) {
		bids.push({
			price: Decimal.from((0.5 - i * 0.01).toFixed(2)),
			size: Decimal.from(((i + 1) * 100).toString()),
		});
		asks.push({
			price: Decimal.from((0.51 + i * 0.01).toFixed(2)),
			size: Decimal.from(((i + 1) * 100).toString()),
		});
	}
	return { bids, asks, timestampMs: Date.now() };
}

const book20 = buildBook(20);
const book50 = buildBook(50);

describe("orderbook depth", () => {
	bench("calcBookDepth buy 20 levels", () => {
		calcBookDepth(book20, "buy");
	});

	bench("calcBookDepth buy 50 levels", () => {
		calcBookDepth(book50, "buy");
	});
});

describe("orderbook imbalance", () => {
	bench("calcImbalanceRatio 20 levels", () => {
		calcImbalanceRatio(book20);
	});

	bench("calcImbalanceRatio top 5 of 50 levels", () => {
		calcImbalanceRatio(book50, 5);
	});
});

describe("orderbook spread", () => {
	bench("calcSpreadBps 20 levels", () => {
		calcSpreadBps(book20);
	});
});

describe("orderbook slippage", () => {
	bench("estimateSlippage buy 500 tokens on 20-level book", () => {
		estimateSlippage(book20, "buy", Decimal.from("500"));
	});

	bench("estimateSlippage buy 2000 tokens on 50-level book", () => {
		estimateSlippage(book50, "buy", Decimal.from("2000"));
	});
});
