import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { MarketScanner } from "./market-scanner.js";
import type { MarketData } from "./market-scanner.js";

const d = (v: number) => Decimal.from(v);

function makeMarket(
	id: string,
	volume: number,
	depth: number,
	spread: number,
	lastUpdateMs = 1000,
): MarketData {
	return {
		marketId: id,
		volume24h: d(volume),
		bookDepth: d(depth),
		spreadBps: d(spread),
		lastUpdateMs,
	};
}

describe("MarketScanner", () => {
	it("returns empty for no markets", () => {
		const scanner = MarketScanner.create();
		expect(scanner.scan([], 1000)).toHaveLength(0);
	});

	it("scores and ranks markets", () => {
		const scanner = MarketScanner.create();
		const markets = [
			makeMarket("low", 100, 50, 200),
			makeMarket("high", 1000, 500, 50),
			makeMarket("mid", 500, 250, 100),
		];
		const scores = scanner.scan(markets, 1000);
		expect(scores).toHaveLength(3);
		expect(scores[0]?.marketId).toBe("high");
	});

	it("higher volume scores better", () => {
		const scanner = MarketScanner.create();
		const markets = [makeMarket("low", 100, 100, 50), makeMarket("high", 1000, 100, 50)];
		const scores = scanner.scan(markets, 1000);
		const highScore = scores.find((s) => s.marketId === "high");
		const lowScore = scores.find((s) => s.marketId === "low");
		expect(highScore?.totalScore.gt(lowScore?.totalScore ?? d(0))).toBe(true);
	});

	it("lower spread scores better", () => {
		const scanner = MarketScanner.create();
		const markets = [makeMarket("tight", 100, 100, 10), makeMarket("wide", 100, 100, 500)];
		const scores = scanner.scan(markets, 1000);
		expect(scores[0]?.marketId).toBe("tight");
	});

	it("filters by maxSpreadBps", () => {
		const scanner = MarketScanner.create({ maxSpreadBps: d(100) });
		const markets = [makeMarket("ok", 100, 100, 50), makeMarket("too-wide", 100, 100, 200)];
		const scores = scanner.scan(markets, 1000);
		expect(scores).toHaveLength(1);
		expect(scores[0]?.marketId).toBe("ok");
	});

	it("freshness decays with age", () => {
		const scanner = MarketScanner.create();
		const markets = [makeMarket("fresh", 100, 100, 50, 1000), makeMarket("stale", 100, 100, 50, 0)];
		const scores = scanner.scan(markets, 1000);
		const fresh = scores.find((s) => s.marketId === "fresh");
		const stale = scores.find((s) => s.marketId === "stale");
		expect(fresh?.components.freshness.gt(stale?.components.freshness ?? d(0))).toBe(true);
	});

	describe("selectTop", () => {
		it("selects top N markets", () => {
			const scanner = MarketScanner.create();
			const markets = [
				makeMarket("a", 1000, 500, 50),
				makeMarket("b", 500, 250, 100),
				makeMarket("c", 100, 50, 200),
			];
			const scores = scanner.scan(markets, 1000);
			const selected = scanner.selectTop(scores, 2);
			expect(selected).toHaveLength(2);
			expect(selected[0]).toBe("a");
		});

		it("respects rotation threshold", () => {
			const scanner = MarketScanner.create({
				rotationThreshold: Decimal.from("0.5"),
			});
			const markets = [
				makeMarket("a", 1000, 500, 50),
				makeMarket("b", 900, 450, 60),
				makeMarket("c", 100, 50, 200),
			];
			const scores = scanner.scan(markets, 1000);
			// b is current, a is slightly better but within threshold
			const selected = scanner.selectTop(scores, 1, ["b"]);
			expect(selected).toContain("b");
		});
	});
});
