import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { calcExpirySpread, defaultExpirySpreadConfig } from "./expiry-spreader.js";

describe("calcExpirySpread", () => {
	const config = defaultExpirySpreadConfig(50);

	it("applies 3x multiplier within 60s of expiry", () => {
		const spread = calcExpirySpread(30_000, config);
		expect(spread.toNumber()).toBe(150);
	});

	it("applies 2x multiplier within 180s of expiry", () => {
		const spread = calcExpirySpread(120_000, config);
		expect(spread.toNumber()).toBe(100);
	});

	it("applies 1.5x multiplier within 600s of expiry", () => {
		const spread = calcExpirySpread(300_000, config);
		expect(spread.toNumber()).toBe(75);
	});

	it("applies 1.2x multiplier within 1 hour of expiry", () => {
		const spread = calcExpirySpread(1_800_000, config);
		expect(spread.toNumber()).toBe(60);
	});

	it("applies 1x (no multiplier) when far from expiry", () => {
		const spread = calcExpirySpread(7_200_000, config);
		expect(spread.toNumber()).toBe(50);
	});

	it("exact boundary: 60s applies 3x multiplier", () => {
		const spread = calcExpirySpread(60_000, config);
		expect(spread.toNumber()).toBe(150);
	});

	it("works with custom config", () => {
		const custom = {
			baseSpreadBps: Decimal.from(100),
			buckets: [{ maxRemainingMs: 30_000, multiplier: Decimal.from("5.0") }],
		};
		expect(calcExpirySpread(10_000, custom).toNumber()).toBe(500);
		expect(calcExpirySpread(60_000, custom).toNumber()).toBe(100);
	});
});
