import { describe, expect, it } from "vitest";
import { MarketSide } from "../shared/market-side.js";
import { expiryCountdown, meanReverting, priceTrend, randomWalk } from "./generators.js";
import type { GeneratorConfig } from "./types.js";

const config: GeneratorConfig = {
	startMs: 0,
	tickIntervalMs: 1000,
	numTicks: 100,
	side: MarketSide.Yes,
};

describe("backtest generators", () => {
	describe("priceTrend", () => {
		it("generates correct number of ticks", () => {
			const ticks = [...priceTrend(config, 0.3, 0.7)];
			expect(ticks).toHaveLength(100);
		});

		it("starts near startPrice and ends near endPrice", () => {
			const ticks = [...priceTrend(config, 0.3, 0.7)];
			const first = ticks[0];
			const last = ticks[99];
			expect(first?.bid.toNumber()).toBeCloseTo(0.29, 1);
			expect(last?.ask.toNumber()).toBeCloseTo(0.71, 1);
		});

		it("timestamps increase by tickIntervalMs", () => {
			const ticks = [...priceTrend(config, 0.5, 0.5)];
			expect(ticks[0]?.timestampMs).toBe(0);
			expect(ticks[1]?.timestampMs).toBe(1000);
			expect(ticks[99]?.timestampMs).toBe(99000);
		});

		it("bid < ask (positive spread)", () => {
			const ticks = [...priceTrend(config, 0.5, 0.5)];
			for (const tick of ticks) {
				expect(tick.bid.lt(tick.ask)).toBe(true);
			}
		});
	});

	describe("randomWalk", () => {
		it("generates correct number of ticks", () => {
			const ticks = [...randomWalk(config, 0.5, 0.01)];
			expect(ticks).toHaveLength(100);
		});

		it("prices stay bounded in [0.001, 0.999]", () => {
			const ticks = [...randomWalk(config, 0.5, 0.1)];
			for (const tick of ticks) {
				expect(tick.bid.toNumber()).toBeGreaterThanOrEqual(0.001);
				expect(tick.ask.toNumber()).toBeLessThanOrEqual(0.999);
			}
		});

		it("different seeds produce different paths", () => {
			const path1 = [...randomWalk(config, 0.5, 0.01, 0.02, 1)];
			const path2 = [...randomWalk(config, 0.5, 0.01, 0.02, 2)];
			const lastBid1 = path1[99]?.bid.toNumber() ?? 0;
			const lastBid2 = path2[99]?.bid.toNumber() ?? 0;
			expect(lastBid1).not.toBeCloseTo(lastBid2, 3);
		});

		it("same seed produces deterministic results", () => {
			const path1 = [...randomWalk(config, 0.5, 0.01, 0.02, 42)];
			const path2 = [...randomWalk(config, 0.5, 0.01, 0.02, 42)];
			expect(path1[50]?.bid.toString()).toBe(path2[50]?.bid.toString());
		});
	});

	describe("meanReverting", () => {
		it("generates correct number of ticks", () => {
			const ticks = [...meanReverting(config, 0.5, 0.1, 0.01)];
			expect(ticks).toHaveLength(100);
		});

		it("stays near target price", () => {
			const ticks = [...meanReverting(config, 0.5, 0.3, 0.005)];
			const midPrices = ticks.map((t) => (t.bid.toNumber() + t.ask.toNumber()) / 2);
			const avgMid = midPrices.reduce((a, b) => a + b, 0) / midPrices.length;
			expect(avgMid).toBeCloseTo(0.5, 0);
		});
	});

	describe("expiryCountdown", () => {
		it("generates correct number of ticks", () => {
			const ticks = [...expiryCountdown(config, 1.0, 0.5, 0.01)];
			expect(ticks).toHaveLength(100);
		});

		it("price trends toward settlement", () => {
			const ticks = [...expiryCountdown(config, 1.0, 0.5, 0.001)];
			const last = ticks[99];
			expect(last).toBeDefined();
			const lastMid = ((last?.bid.toNumber() ?? 0) + (last?.ask.toNumber() ?? 0)) / 2;
			// Should drift toward 1.0
			expect(lastMid).toBeGreaterThan(0.5);
		});

		it("spread widens near expiry", () => {
			const ticks = [...expiryCountdown(config, 1.0, 0.5, 0.01)];
			const first = ticks[0];
			const last = ticks[99];
			expect(first).toBeDefined();
			expect(last).toBeDefined();
			const firstSpread = (first?.ask.toNumber() ?? 0) - (first?.bid.toNumber() ?? 0);
			const lastSpread = (last?.ask.toNumber() ?? 0) - (last?.bid.toNumber() ?? 0);
			expect(lastSpread).toBeGreaterThan(firstSpread);
		});
	});
});
