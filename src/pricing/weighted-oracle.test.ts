import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { FakeClock } from "../shared/time.js";
import { WeightedOracle } from "./weighted-oracle.js";
import type { WeightedOracleConfig } from "./weighted-oracle.js";

function makeConfig(overrides?: Partial<WeightedOracleConfig>): WeightedOracleConfig {
	return {
		sources: [
			{ name: "binance", weight: Decimal.from("0.6"), maxAgeMs: 10_000 },
			{ name: "coinbase", weight: Decimal.from("0.4"), maxAgeMs: 10_000 },
		],
		maxDivergence: Decimal.from("0.05"),
		...overrides,
	};
}

describe("WeightedOracle", () => {
	it("returns null with no updates", () => {
		const clock = new FakeClock(1000);
		const oracle = WeightedOracle.create(makeConfig(), clock);
		expect(oracle.aggregate()).toBeNull();
	});

	it("returns single source price when only one is available", () => {
		const clock = new FakeClock(1000);
		const oracle = WeightedOracle.create(makeConfig(), clock);
		oracle.update({ source: "binance", price: Decimal.from("100"), timestampMs: 1000 });

		const result = oracle.aggregate();
		expect(result).not.toBeNull();
		expect(result?.price.toNumber()).toBeCloseTo(100, 2);
		expect(result?.activeSources).toBe(1);
	});

	it("computes weighted average with two sources", () => {
		const clock = new FakeClock(1000);
		const oracle = WeightedOracle.create(makeConfig(), clock);
		oracle.update({ source: "binance", price: Decimal.from("100"), timestampMs: 1000 });
		oracle.update({ source: "coinbase", price: Decimal.from("102"), timestampMs: 1000 });

		const result = oracle.aggregate();
		expect(result).not.toBeNull();
		// Both fresh → no staleness decay
		// Weighted avg = (100*0.6 + 102*0.4) / (0.6+0.4) = 100.8
		expect(result?.price.toNumber()).toBeCloseTo(100.8, 1);
		expect(result?.activeSources).toBe(2);
	});

	it("applies staleness decay", () => {
		const clock = new FakeClock(6000);
		const oracle = WeightedOracle.create(makeConfig(), clock);
		// Binance: 4000ms old → decay = 1 - 4000/10000 = 0.6 → effective = 0.6*0.6 = 0.36
		oracle.update({ source: "binance", price: Decimal.from("100"), timestampMs: 2000 });
		// Coinbase: 1000ms old → decay = 1 - 1000/10000 = 0.9 → effective = 0.4*0.9 = 0.36
		oracle.update({ source: "coinbase", price: Decimal.from("102"), timestampMs: 5000 });

		const result = oracle.aggregate();
		expect(result).not.toBeNull();
		// Equal effective weights → avg ≈ 101
		expect(result?.price.toNumber()).toBeCloseTo(101, 0);
	});

	it("excludes stale sources", () => {
		const clock = new FakeClock(20_000);
		const oracle = WeightedOracle.create(makeConfig(), clock);
		// Binance: 15s old → beyond 10s maxAge → stale
		oracle.update({ source: "binance", price: Decimal.from("100"), timestampMs: 5000 });
		// Coinbase: 5s old → still fresh
		oracle.update({ source: "coinbase", price: Decimal.from("102"), timestampMs: 15_000 });

		const result = oracle.aggregate();
		expect(result).not.toBeNull();
		expect(result?.price.toNumber()).toBeCloseTo(102, 2);
		expect(result?.activeSources).toBe(1);
	});

	it("returns null when all sources are stale", () => {
		const clock = new FakeClock(100_000);
		const oracle = WeightedOracle.create(makeConfig(), clock);
		oracle.update({ source: "binance", price: Decimal.from("100"), timestampMs: 1000 });
		oracle.update({ source: "coinbase", price: Decimal.from("102"), timestampMs: 1000 });

		expect(oracle.aggregate()).toBeNull();
	});

	it("returns null when sources diverge beyond threshold", () => {
		const clock = new FakeClock(1000);
		const oracle = WeightedOracle.create(makeConfig(), clock);
		// 10% divergence > 5% threshold
		oracle.update({ source: "binance", price: Decimal.from("100"), timestampMs: 1000 });
		oracle.update({ source: "coinbase", price: Decimal.from("111"), timestampMs: 1000 });

		expect(oracle.aggregate()).toBeNull();
	});

	it("ignores unknown source updates", () => {
		const clock = new FakeClock(1000);
		const oracle = WeightedOracle.create(makeConfig(), clock);
		oracle.update({ source: "unknown", price: Decimal.from("100"), timestampMs: 1000 });
		expect(oracle.aggregate()).toBeNull();
	});

	it("marks unreliable when below minActiveSources", () => {
		const clock = new FakeClock(1000);
		const config = makeConfig({ minActiveSources: 2 });
		const oracle = WeightedOracle.create(config, clock);
		oracle.update({ source: "binance", price: Decimal.from("100"), timestampMs: 1000 });

		const result = oracle.aggregate();
		expect(result).not.toBeNull();
		expect(result?.reliable).toBe(false);
	});

	it("marks reliable when at minActiveSources", () => {
		const clock = new FakeClock(1000);
		const config = makeConfig({ minActiveSources: 2 });
		const oracle = WeightedOracle.create(config, clock);
		oracle.update({ source: "binance", price: Decimal.from("100"), timestampMs: 1000 });
		oracle.update({ source: "coinbase", price: Decimal.from("101"), timestampMs: 1000 });

		const result = oracle.aggregate();
		expect(result).not.toBeNull();
		expect(result?.reliable).toBe(true);
	});

	it("provides source status", () => {
		const clock = new FakeClock(5000);
		const oracle = WeightedOracle.create(makeConfig(), clock);
		oracle.update({ source: "binance", price: Decimal.from("100"), timestampMs: 3000 });

		const status = oracle.getSourceStatus();
		expect(status).toHaveLength(2);

		const binance = status.find((s) => s.name === "binance");
		expect(binance?.stale).toBe(false);
		expect(binance?.ageMs).toBe(2000);
		expect(binance?.price?.toString()).toBe("100");

		const coinbase = status.find((s) => s.name === "coinbase");
		expect(coinbase?.stale).toBe(true);
		expect(coinbase?.price).toBeNull();
	});

	describe("outlier detection with 3+ sources", () => {
		it("excludes outlier source using median filter", () => {
			const clock = new FakeClock(1000);
			const config: WeightedOracleConfig = {
				sources: [
					{ name: "binance", weight: Decimal.from("0.4"), maxAgeMs: 10_000 },
					{ name: "coinbase", weight: Decimal.from("0.3"), maxAgeMs: 10_000 },
					{ name: "kraken", weight: Decimal.from("0.3"), maxAgeMs: 10_000 },
				],
				maxDivergence: Decimal.from("0.05"),
			};
			const oracle = WeightedOracle.create(config, clock);
			oracle.update({ source: "binance", price: Decimal.from("100"), timestampMs: 1000 });
			oracle.update({ source: "coinbase", price: Decimal.from("101"), timestampMs: 1000 });
			oracle.update({ source: "kraken", price: Decimal.from("120"), timestampMs: 1000 });

			const result = oracle.aggregate();
			expect(result).not.toBeNull();
			// Kraken is outlier (20% from median 101), should be excluded
			expect(result?.activeSources).toBe(2);
			expect(result?.price.toNumber()).toBeCloseTo(100.4, 0);
		});
	});
});
