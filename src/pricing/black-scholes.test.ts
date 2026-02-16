import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import {
	binaryCallPrice,
	binaryPutPrice,
	calcEdge,
	calcExpectedValue,
	calcGammaFactor,
	normalCdf,
	priceBinary,
} from "./black-scholes.js";
import type { PricingInput } from "./types.js";

describe("normalCdf", () => {
	it("returns 0.5 for x=0 (mean of standard normal)", () => {
		const result = normalCdf(0);
		expect(result).toBeCloseTo(0.5, 4);
	});

	it("returns ~1 for large positive values", () => {
		const result = normalCdf(5);
		expect(result).toBeGreaterThan(0.999);
	});

	it("returns ~0 for large negative values", () => {
		const result = normalCdf(-5);
		expect(result).toBeLessThan(0.001);
	});

	it("returns ~0.975 for x=1.96 (two-sigma)", () => {
		const result = normalCdf(1.96);
		expect(result).toBeCloseTo(0.975, 3);
	});

	it("returns ~0.025 for x=-1.96", () => {
		const result = normalCdf(-1.96);
		expect(result).toBeCloseTo(0.025, 3);
	});

	it("returns ~0.841 for x=1.0", () => {
		const result = normalCdf(1.0);
		expect(result).toBeCloseTo(0.841, 3);
	});
});

describe("binaryCallPrice", () => {
	it("returns <0.5 for spot=0.5 due to vol drag (drift = -vol²/2)", () => {
		const input: PricingInput = {
			spot: Decimal.from("0.5"),
			vol: Decimal.from("0.5"),
			timeToExpiry: Decimal.from("1"),
		};
		const price = binaryCallPrice(input);
		// With vol=0.5, drift = -0.125, d2 = -0.25, N(-0.25) ≈ 0.401
		expect(price.toNumber()).toBeCloseTo(0.401, 1);
	});

	it("returns >0.5 for spot=0.7 (in-the-money)", () => {
		const input: PricingInput = {
			spot: Decimal.from("0.7"),
			vol: Decimal.from("0.5"),
			timeToExpiry: Decimal.from("1"),
		};
		const price = binaryCallPrice(input);
		expect(price.toNumber()).toBeGreaterThan(0.5);
	});

	it("returns <0.5 for spot=0.3 (out-of-the-money)", () => {
		const input: PricingInput = {
			spot: Decimal.from("0.3"),
			vol: Decimal.from("0.5"),
			timeToExpiry: Decimal.from("1"),
		};
		const price = binaryCallPrice(input);
		expect(price.toNumber()).toBeLessThan(0.5);
	});

	it("returns spot when timeToExpiry ≈ 0", () => {
		const input: PricingInput = {
			spot: Decimal.from("0.6"),
			vol: Decimal.from("0.5"),
			timeToExpiry: Decimal.from("0.0000001"),
		};
		const price = binaryCallPrice(input);
		expect(price.toNumber()).toBeCloseTo(0.6, 2);
	});

	it("returns 1 when vol ≈ 0 and spot > 0.5", () => {
		const input: PricingInput = {
			spot: Decimal.from("0.7"),
			vol: Decimal.from("0.001"),
			timeToExpiry: Decimal.from("1"),
		};
		const price = binaryCallPrice(input);
		expect(price.toNumber()).toBeCloseTo(1, 1);
	});

	it("returns 0 when vol ≈ 0 and spot < 0.5", () => {
		const input: PricingInput = {
			spot: Decimal.from("0.3"),
			vol: Decimal.from("0.001"),
			timeToExpiry: Decimal.from("1"),
		};
		const price = binaryCallPrice(input);
		expect(price.toNumber()).toBeCloseTo(0, 1);
	});

	it("handles spot near 0 (clamped)", () => {
		const input: PricingInput = {
			spot: Decimal.from("0.001"),
			vol: Decimal.from("0.5"),
			timeToExpiry: Decimal.from("1"),
		};
		const price = binaryCallPrice(input);
		expect(price.toNumber()).toBeGreaterThanOrEqual(0);
		expect(price.toNumber()).toBeLessThanOrEqual(1);
	});

	it("handles spot near 1 (clamped)", () => {
		const input: PricingInput = {
			spot: Decimal.from("0.999"),
			vol: Decimal.from("0.5"),
			timeToExpiry: Decimal.from("1"),
		};
		const price = binaryCallPrice(input);
		expect(price.toNumber()).toBeGreaterThanOrEqual(0);
		expect(price.toNumber()).toBeLessThanOrEqual(1);
	});

	it("uses risk-free rate when provided", () => {
		const inputWithRate: PricingInput = {
			spot: Decimal.from("0.5"),
			vol: Decimal.from("0.5"),
			timeToExpiry: Decimal.from("1"),
			riskFreeRate: Decimal.from("0.05"),
		};
		const priceWithRate = binaryCallPrice(inputWithRate);

		const inputWithoutRate: PricingInput = {
			spot: Decimal.from("0.5"),
			vol: Decimal.from("0.5"),
			timeToExpiry: Decimal.from("1"),
		};
		const priceWithoutRate = binaryCallPrice(inputWithoutRate);

		expect(priceWithRate.eq(priceWithoutRate)).toBe(false);
	});
});

describe("binaryPutPrice", () => {
	it("returns 1 - callPrice", () => {
		const input: PricingInput = {
			spot: Decimal.from("0.6"),
			vol: Decimal.from("0.5"),
			timeToExpiry: Decimal.from("1"),
		};
		const callPrice = binaryCallPrice(input);
		const putPrice = binaryPutPrice(input);
		const sum = callPrice.add(putPrice);
		expect(sum.toNumber()).toBeCloseTo(1, 8);
	});

	it("returns >0.5 for spot=0.3 (in-the-money put)", () => {
		const input: PricingInput = {
			spot: Decimal.from("0.3"),
			vol: Decimal.from("0.5"),
			timeToExpiry: Decimal.from("1"),
		};
		const putPrice = binaryPutPrice(input);
		expect(putPrice.toNumber()).toBeGreaterThan(0.5);
	});

	it("returns <0.5 for spot=0.7 (out-of-the-money put)", () => {
		const input: PricingInput = {
			spot: Decimal.from("0.7"),
			vol: Decimal.from("0.5"),
			timeToExpiry: Decimal.from("1"),
		};
		const putPrice = binaryPutPrice(input);
		expect(putPrice.toNumber()).toBeLessThan(0.5);
	});
});

describe("calcEdge", () => {
	it("returns (fair - market) / market for normal case", () => {
		const fairPrice = Decimal.from("0.6");
		const marketPrice = Decimal.from("0.5");
		const edge = calcEdge(fairPrice, marketPrice);
		expect(edge.toNumber()).toBeCloseTo(0.2, 8);
	});

	it("returns negative edge when fair < market", () => {
		const fairPrice = Decimal.from("0.4");
		const marketPrice = Decimal.from("0.5");
		const edge = calcEdge(fairPrice, marketPrice);
		expect(edge.toNumber()).toBeCloseTo(-0.2, 8);
	});

	it("returns zero when fair = market", () => {
		const fairPrice = Decimal.from("0.5");
		const marketPrice = Decimal.from("0.5");
		const edge = calcEdge(fairPrice, marketPrice);
		expect(edge.isZero()).toBe(true);
	});

	it("returns zero when market is zero", () => {
		const fairPrice = Decimal.from("0.5");
		const marketPrice = Decimal.zero();
		const edge = calcEdge(fairPrice, marketPrice);
		expect(edge.isZero()).toBe(true);
	});

	it("handles large edge values", () => {
		const fairPrice = Decimal.from("0.9");
		const marketPrice = Decimal.from("0.3");
		const edge = calcEdge(fairPrice, marketPrice);
		expect(edge.toNumber()).toBeCloseTo(2.0, 8);
	});
});

describe("calcGammaFactor", () => {
	it("returns lowest value at spot=0.5 (minimum of 1/(s*(1-s)))", () => {
		const gammaAt05 = calcGammaFactor(Decimal.from("0.5"), Decimal.from("1"));
		const gammaAt03 = calcGammaFactor(Decimal.from("0.3"), Decimal.from("1"));
		// 1/(0.5*0.5) = 4, 1/(0.3*0.7) = 4.76 → gamma is HIGHER away from 0.5
		expect(gammaAt05.toNumber()).toBeLessThan(gammaAt03.toNumber());
	});

	it("returns higher value for spot=0.1 (near extremes)", () => {
		const gammaAt05 = calcGammaFactor(Decimal.from("0.5"), Decimal.from("1"));
		const gammaAt01 = calcGammaFactor(Decimal.from("0.1"), Decimal.from("1"));
		// 1/(0.1*0.9) = 11.11 > 4.0 = 1/(0.5*0.5)
		expect(gammaAt01.toNumber()).toBeGreaterThan(gammaAt05.toNumber());
	});

	it("returns zero when timeToExpiry ≈ 0", () => {
		const gamma = calcGammaFactor(Decimal.from("0.5"), Decimal.from("0.0000001"));
		expect(gamma.isZero()).toBe(true);
	});

	it("clamps spot to [0.01, 0.99] for safety", () => {
		const gammaLow = calcGammaFactor(Decimal.from("0.001"), Decimal.from("1"));
		const gammaHigh = calcGammaFactor(Decimal.from("0.999"), Decimal.from("1"));
		expect(gammaLow.isPositive()).toBe(true);
		expect(gammaHigh.isPositive()).toBe(true);
	});

	it("scales inversely with sqrt(timeToExpiry)", () => {
		const gamma1y = calcGammaFactor(Decimal.from("0.5"), Decimal.from("1"));
		const gamma4y = calcGammaFactor(Decimal.from("0.5"), Decimal.from("4"));
		expect(gamma1y.toNumber()).toBeCloseTo(gamma4y.toNumber() * 2, 1);
	});
});

describe("calcExpectedValue", () => {
	it("returns (fairPrice / marketPrice) - 1", () => {
		const fairPrice = Decimal.from("0.6");
		const marketPrice = Decimal.from("0.5");
		const ev = calcExpectedValue(fairPrice, marketPrice);
		expect(ev.toNumber()).toBeCloseTo(0.2, 8);
	});

	it("returns negative EV when fair < market", () => {
		const fairPrice = Decimal.from("0.4");
		const marketPrice = Decimal.from("0.5");
		const ev = calcExpectedValue(fairPrice, marketPrice);
		expect(ev.toNumber()).toBeCloseTo(-0.2, 8);
	});

	it("returns zero when fair = market", () => {
		const fairPrice = Decimal.from("0.5");
		const marketPrice = Decimal.from("0.5");
		const ev = calcExpectedValue(fairPrice, marketPrice);
		expect(ev.isZero()).toBe(true);
	});

	it("handles large EV values", () => {
		const fairPrice = Decimal.from("0.9");
		const marketPrice = Decimal.from("0.3");
		const ev = calcExpectedValue(fairPrice, marketPrice);
		expect(ev.toNumber()).toBeCloseTo(2.0, 8);
	});

	it("returns zero when marketPrice is zero (div-by-zero guard)", () => {
		const ev = calcExpectedValue(Decimal.from("0.5"), Decimal.zero());
		expect(ev.isZero()).toBe(true);
	});
});

describe("priceBinary", () => {
	it("combines all pricing calculations", () => {
		const input: PricingInput = {
			spot: Decimal.from("0.6"),
			vol: Decimal.from("0.5"),
			timeToExpiry: Decimal.from("1"),
		};
		const marketPrice = Decimal.from("0.5");
		const result = priceBinary(input, marketPrice);

		expect(result.fairPrice.isPositive()).toBe(true);
		expect(result.edge.isPositive()).toBe(true);
		expect(result.gammaFactor.isPositive()).toBe(true);
		expect(result.kellyFraction.isPositive()).toBe(true);
		expect(result.expectedValue.isPositive()).toBe(true);
	});

	it("handles negative edge when overpriced", () => {
		const input: PricingInput = {
			spot: Decimal.from("0.4"),
			vol: Decimal.from("0.5"),
			timeToExpiry: Decimal.from("1"),
		};
		const marketPrice = Decimal.from("0.6");
		const result = priceBinary(input, marketPrice);

		expect(result.fairPrice.lt(marketPrice)).toBe(true);
		expect(result.edge.isNegative()).toBe(true);
		expect(result.expectedValue.isNegative()).toBe(true);
	});

	it("returns zero kelly fraction when fair = market", () => {
		const input: PricingInput = {
			spot: Decimal.from("0.5"),
			vol: Decimal.from("0.5"),
			timeToExpiry: Decimal.from("1"),
		};
		const fairPrice = binaryCallPrice(input);
		const result = priceBinary(input, fairPrice);

		expect(result.edge.abs().toNumber()).toBeLessThan(0.01);
		expect(result.kellyFraction.abs().toNumber()).toBeLessThan(0.01);
	});

	it("returns zero expectedValue when marketPrice is zero (no throw)", () => {
		const input: PricingInput = {
			spot: Decimal.from("0.6"),
			vol: Decimal.from("0.5"),
			timeToExpiry: Decimal.from("1"),
		};
		const result = priceBinary(input, Decimal.zero());

		expect(result.expectedValue.isZero()).toBe(true);
		expect(result.kellyFraction.isZero()).toBe(true);
		expect(result.fairPrice.isPositive()).toBe(true);
		expect(result.gammaFactor.isPositive()).toBe(true);
	});

	describe("table-driven: multiple spot/vol/time combinations", () => {
		it.each([
			{ spot: "0.3", vol: "0.3", time: "0.5", expectedFairLt: 0.5 },
			{ spot: "0.7", vol: "0.3", time: "0.5", expectedFairGt: 0.5 },
			{ spot: "0.5", vol: "0.8", time: "2", expectedFairLt: 0.5 },
			{ spot: "0.6", vol: "0.4", time: "0.25", expectedFairGt: 0.5 },
			{ spot: "0.2", vol: "0.6", time: "1", expectedFairLt: 0.5 },
		])(
			"spot=$spot, vol=$vol, time=$time produces expected fair price",
			({ spot, vol, time, expectedFairLt, expectedFairGt, expectedFairApprox }) => {
				const input: PricingInput = {
					spot: Decimal.from(spot),
					vol: Decimal.from(vol),
					timeToExpiry: Decimal.from(time),
				};
				const marketPrice = Decimal.from("0.5");
				const result = priceBinary(input, marketPrice);

				if (expectedFairLt !== undefined) {
					expect(result.fairPrice.toNumber()).toBeLessThan(expectedFairLt);
				}
				if (expectedFairGt !== undefined) {
					expect(result.fairPrice.toNumber()).toBeGreaterThan(expectedFairGt);
				}
				if (expectedFairApprox !== undefined) {
					expect(result.fairPrice.toNumber()).toBeCloseTo(expectedFairApprox, 1);
				}

				expect(result.fairPrice.toNumber()).toBeGreaterThanOrEqual(0);
				expect(result.fairPrice.toNumber()).toBeLessThanOrEqual(1);
			},
		);
	});
});
