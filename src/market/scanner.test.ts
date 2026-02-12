import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { conditionId } from "../shared/identifiers.js";
import { scan } from "./scanner.js";
import type { MarketInfo, OrderbookLevel, OrderbookSnapshot } from "./types.js";

function level(price: string, size: string): OrderbookLevel {
	return { price: Decimal.from(price), size: Decimal.from(size) };
}

function makeMarket(id: string, overrides?: Partial<MarketInfo>): MarketInfo {
	return {
		conditionId: conditionId(id),
		questionId: `q-${id}`,
		question: `Question ${id}`,
		description: `Desc ${id}`,
		active: true,
		closed: false,
		endDate: "2025-12-31",
		...overrides,
	};
}

function makeBook(bids: OrderbookLevel[], asks: OrderbookLevel[]): OrderbookSnapshot {
	return { bids, asks, timestampMs: 1000 };
}

describe("scan", () => {
	it("scores markets based on spread and edge", () => {
		const market = makeMarket("m1");
		const book = makeBook([level("0.48", "100")], [level("0.52", "100")]);
		const oracle = new Map([["m1", Decimal.from("0.55")]]);
		const books = new Map([["m1", book]]);

		const results = scan([market], books, oracle);

		expect(results).toHaveLength(1);
		expect(results[0]?.conditionId).toBe(conditionId("m1"));
		// mid = (0.48 + 0.52) / 2 = 0.50, edge = |0.55 - 0.50| = 0.05
		// spread = 0.52 - 0.48 = 0.04, score = 0.05 / 0.04 = 1.25
		expect(results[0]?.spread.toString()).toBe("0.04");
		expect(results[0]?.edge.toString()).toBe("0.05");
		expect(results[0]?.score).toBeCloseTo(1.25);
	});

	it("returns empty array for empty market list", () => {
		const results = scan([], new Map());

		expect(results).toEqual([]);
	});

	it("results are sorted by score descending", () => {
		const m1 = makeMarket("m1");
		const m2 = makeMarket("m2");
		// m1: mid=0.50, spread=0.04, edge uses mid (no oracle) => edge=0, score=0
		const book1 = makeBook([level("0.48", "100")], [level("0.52", "100")]);
		// m2: mid=0.50, spread=0.02, oracle=0.55 => edge=0.05, score=0.05/0.02=2.5
		const book2 = makeBook([level("0.49", "100")], [level("0.51", "100")]);
		const oracle = new Map([["m2", Decimal.from("0.55")]]);
		const books = new Map([
			["m1", book1],
			["m2", book2],
		]);

		const results = scan([m1, m2], books, oracle);

		expect(results).toHaveLength(2);
		expect(results[0]?.conditionId).toBe(conditionId("m2"));
		expect(results[1]?.conditionId).toBe(conditionId("m1"));
	});

	it("skips markets without orderbook data", () => {
		const m1 = makeMarket("m1");
		const m2 = makeMarket("m2");
		// Only m2 has a book
		const book2 = makeBook([level("0.49", "100")], [level("0.51", "100")]);
		const books = new Map([["m2", book2]]);

		const results = scan([m1, m2], books);

		expect(results).toHaveLength(1);
		expect(results[0]?.conditionId).toBe(conditionId("m2"));
	});

	it("skips market with only bids and no asks", () => {
		const market = makeMarket("m1");
		const book = makeBook([level("0.50", "100")], []);
		const books = new Map([["m1", book]]);

		const results = scan([market], books);

		expect(results).toHaveLength(0);
	});
});
