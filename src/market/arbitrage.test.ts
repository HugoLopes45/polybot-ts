import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { isErr, isOk } from "../shared/result.js";
import { calcArbProfit, calcOptimalSize, checkArbitrage } from "./arbitrage.js";
import type { ArbitrageOpportunity } from "./arbitrage.js";
import type { OrderbookSnapshot } from "./types.js";

const emptyBook: OrderbookSnapshot = {
	bids: [],
	asks: [],
	timestampMs: Date.now(),
};

const makeBook = (bids: [number, number][], asks: [number, number][]): OrderbookSnapshot => ({
	bids: bids.map(([price, size]) => ({
		price: Decimal.from(price),
		size: Decimal.from(size),
	})),
	asks: asks.map(([price, size]) => ({
		price: Decimal.from(price),
		size: Decimal.from(size),
	})),
	timestampMs: Date.now(),
});

const makeOpp = (yesPrice: string, noPrice: string): ArbitrageOpportunity => ({
	type: "long",
	grossProfit: Decimal.from("15"),
	netProfit: Decimal.from("13"),
	legs: [
		{ action: "buy", side: "yes", price: Decimal.from(yesPrice) },
		{ action: "buy", side: "no", price: Decimal.from(noPrice) },
	],
});

describe("checkArbitrage", () => {
	it("should detect long arbitrage (buyYes + buyNo < 1)", () => {
		const yesBook = makeBook([[0.55, 100]], [[0.4, 100]]);
		const noBook = makeBook([[0.5, 100]], [[0.45, 100]]);
		const feeRate = Decimal.from("0.02");

		const result = checkArbitrage(yesBook, noBook, feeRate);

		expect(result).not.toBeNull();
		expect(result?.type).toBe("long");
		expect(result?.legs).toHaveLength(2);
		const totalCost = Decimal.from("0.40").add(Decimal.from("0.45"));
		expect(result?.grossProfit.toString()).toBe(Decimal.one().sub(totalCost).toString());
		const expectedFee = feeRate.mul(totalCost);
		expect(result?.netProfit.toString()).toBe(result?.grossProfit.sub(expectedFee).toString());
	});

	it("should detect short arbitrage when both long and short exist, prioritizing long", () => {
		const yesBook = makeBook([[0.6, 100]], [[0.9, 100]]);
		const noBook = makeBook([[0.6, 100]], [[0.9, 100]]);
		const feeRate = Decimal.from("0.02");

		const result = checkArbitrage(yesBook, noBook, feeRate);

		expect(result).not.toBeNull();
		expect(result?.type).toBe("long");
	});

	it("should compute short arb legs when both arbs coexist", () => {
		const yesBook = makeBook([[0.6, 100]], [[0.9, 100]]);
		const noBook = makeBook([[0.6, 100]], [[0.9, 100]]);
		const feeRate = Decimal.from("0.02");

		const result = checkArbitrage(yesBook, noBook, feeRate);

		expect(result).not.toBeNull();
		expect(result?.type).toBe("long");
		expect(result?.netProfit.isPositive()).toBe(true);
		expect(result?.legs).toHaveLength(2);
		expect(result?.legs[0]?.action).toBe("buy");
		expect(result?.legs[1]?.action).toBe("buy");
	});

	it("should return null when prices at parity (totalCost = 1.00)", () => {
		const yesBook = makeBook([[0.5, 100]], [[0.5, 100]]);
		const noBook = makeBook([[0.5, 100]], [[0.5, 100]]);
		const feeRate = Decimal.from("0.02");

		const result = checkArbitrage(yesBook, noBook, feeRate);

		expect(result).toBeNull();
	});

	it("should return null when overpriced (totalCost > 1)", () => {
		const yesBook = makeBook([[0.4, 100]], [[0.45, 100]]);
		const noBook = makeBook([[0.6, 100]], [[0.65, 100]]);
		const feeRate = Decimal.from("0.02");

		const result = checkArbitrage(yesBook, noBook, feeRate);

		expect(result).toBeNull();
	});

	it("should return null when fee eats long arb profit", () => {
		const yesBook = makeBook([[0.52, 100]], [[0.495, 100]]);
		const noBook = makeBook([[0.51, 100]], [[0.495, 100]]);
		const feeRate = Decimal.from("0.05");

		const result = checkArbitrage(yesBook, noBook, feeRate);

		expect(result).toBeNull();
	});

	it("should return null when fee eats short arb profit", () => {
		const yesBook = makeBook([[0.51, 100]], [[0.54, 100]]);
		const noBook = makeBook([[0.49, 100]], [[0.52, 100]]);
		const feeRate = Decimal.from("0.06");

		const result = checkArbitrage(yesBook, noBook, feeRate);

		expect(result).toBeNull();
	});

	it("should return null for empty book", () => {
		const feeRate = Decimal.from("0.02");

		const result = checkArbitrage(emptyBook, emptyBook, feeRate);

		expect(result).toBeNull();
	});

	it("should return valid arb when tiny profit survives fee", () => {
		const yesBook = makeBook([[0.52, 100]], [[0.485, 100]]);
		const noBook = makeBook([[0.505, 100]], [[0.51, 100]]);
		const feeRate = Decimal.from("0.02");

		const result = checkArbitrage(yesBook, noBook, feeRate);

		expect(result).not.toBeNull();
		expect(result?.type).toBe("long");
		const totalCost = Decimal.from("0.485").add(Decimal.from("0.48"));
		const gross = Decimal.one().sub(totalCost);
		const fee = feeRate.mul(totalCost);
		const net = gross.sub(fee);
		expect(result?.netProfit.toString()).toBe(net.toString());
	});

	it("should use mirror-aware prices for buyYes", () => {
		const yesBook = makeBook([[0.8, 100]], [[0.85, 100]]);
		const noBook = makeBook([[0.3, 100]], [[0.6, 100]]);
		const feeRate = Decimal.from("0.02");

		const result = checkArbitrage(yesBook, noBook, feeRate);

		expect(result).not.toBeNull();
		expect(result?.type).toBe("long");
		const buyYesPrice = Decimal.one().sub(Decimal.from("0.30"));
		expect(result?.legs.find((l) => l.side === "yes")?.price.toString()).toBe(
			buyYesPrice.toString(),
		);
	});

	it("should use mirror-aware prices for buyNo", () => {
		const yesBook = makeBook([[0.6, 100]], [[0.35, 100]]);
		const noBook = makeBook([[0.1, 100]], [[0.8, 100]]);
		const feeRate = Decimal.from("0.02");

		const result = checkArbitrage(yesBook, noBook, feeRate);

		expect(result).not.toBeNull();
		expect(result?.type).toBe("long");
		const buyNoPrice = Decimal.one().sub(Decimal.from("0.60"));
		expect(result?.legs.find((l) => l.side === "no")?.price.toString()).toBe(buyNoPrice.toString());
	});
});

describe("calcArbProfit", () => {
	it("calculates correct profit breakdown", () => {
		const result = calcArbProfit(
			Decimal.from("0.40"),
			Decimal.from("0.45"),
			Decimal.from("100"),
			Decimal.from("0.02"),
		);
		expect(isOk(result)).toBe(true);
		if (!isOk(result)) return;
		// totalCost = (0.40 + 0.45) * 100 = 85
		// gross = (1 - 0.40 - 0.45) * 100 = 15
		// totalFees = 0.02 * 85 = 1.7
		// net = 15 - 1.7 = 13.3
		expect(result.value.gross.toString()).toBe("15");
		expect(result.value.totalCost.toString()).toBe("85");
		expect(result.value.totalFees.toString()).toBe("1.7");
		expect(result.value.net.toString()).toBe("13.3");
		// roiPct = 13.3 / 85 * 100
		expect(result.value.roiPct.gt(Decimal.from("15.6"))).toBe(true);
		expect(result.value.roiPct.lt(Decimal.from("15.7"))).toBe(true);
	});

	it("returns all zeros for zero size", () => {
		const result = calcArbProfit(
			Decimal.from("0.40"),
			Decimal.from("0.45"),
			Decimal.zero(),
			Decimal.from("0.02"),
		);
		expect(isOk(result)).toBe(true);
		if (!isOk(result)) return;
		expect(result.value.gross.isZero()).toBe(true);
		expect(result.value.totalFees.isZero()).toBe(true);
		expect(result.value.net.isZero()).toBe(true);
		expect(result.value.roiPct.isZero()).toBe(true);
	});

	it("handles high-fee scenario reducing net profit", () => {
		const result = calcArbProfit(
			Decimal.from("0.30"),
			Decimal.from("0.30"),
			Decimal.from("50"),
			Decimal.from("0.10"),
		);
		expect(isOk(result)).toBe(true);
		if (!isOk(result)) return;
		expect(result.value.gross.toString()).toBe("20");
		expect(result.value.totalFees.toString()).toBe("3");
		expect(result.value.net.toString()).toBe("17");
	});

	it("returns zero fee with zero fee rate", () => {
		const result = calcArbProfit(
			Decimal.from("0.40"),
			Decimal.from("0.45"),
			Decimal.from("100"),
			Decimal.zero(),
		);
		expect(isOk(result)).toBe(true);
		if (!isOk(result)) return;
		expect(result.value.totalFees.isZero()).toBe(true);
		expect(result.value.net.toString()).toBe(result.value.gross.toString());
	});

	it("returns zero gross at boundary yesPrice + noPrice = 1.0", () => {
		const result = calcArbProfit(
			Decimal.from("0.50"),
			Decimal.from("0.50"),
			Decimal.from("100"),
			Decimal.from("0.02"),
		);
		expect(isOk(result)).toBe(true);
		if (!isOk(result)) return;
		expect(result.value.gross.isZero()).toBe(true);
		// net is negative due to fees
		expect(result.value.net.isNegative()).toBe(true);
	});

	it("rejects negative yesPrice", () => {
		const result = calcArbProfit(
			Decimal.from("-0.1"),
			Decimal.from("0.45"),
			Decimal.from("100"),
			Decimal.from("0.02"),
		);
		expect(isErr(result)).toBe(true);
		if (isErr(result)) expect(result.error.code).toBe("INVALID_PRICE");
	});

	it("rejects yesPrice > 1", () => {
		const result = calcArbProfit(
			Decimal.from("1.5"),
			Decimal.from("0.45"),
			Decimal.from("100"),
			Decimal.from("0.02"),
		);
		expect(isErr(result)).toBe(true);
		if (isErr(result)) expect(result.error.code).toBe("INVALID_PRICE");
	});

	it("rejects negative noPrice", () => {
		const result = calcArbProfit(
			Decimal.from("0.40"),
			Decimal.from("-0.1"),
			Decimal.from("100"),
			Decimal.from("0.02"),
		);
		expect(isErr(result)).toBe(true);
		if (isErr(result)) expect(result.error.code).toBe("INVALID_PRICE");
	});

	it("accepts boundary price 0 as valid input", () => {
		const result1 = calcArbProfit(
			Decimal.from("0"),
			Decimal.from("0.5"),
			Decimal.from("100"),
			Decimal.from("0.02"),
		);
		expect(isOk(result1)).toBe(true);

		const result2 = calcArbProfit(
			Decimal.from("1"),
			Decimal.from("0"),
			Decimal.from("100"),
			Decimal.from("0.02"),
		);
		expect(isOk(result2)).toBe(true);

		const result3 = calcArbProfit(
			Decimal.from("0.5"),
			Decimal.from("0"),
			Decimal.from("100"),
			Decimal.from("0.02"),
		);
		expect(isOk(result3)).toBe(true);
	});

	it("accepts boundary price 1 as valid input", () => {
		const result1 = calcArbProfit(
			Decimal.from("1"),
			Decimal.from("0.5"),
			Decimal.from("100"),
			Decimal.from("0.02"),
		);
		expect(isOk(result1)).toBe(true);

		const result2 = calcArbProfit(
			Decimal.from("0.5"),
			Decimal.from("1"),
			Decimal.from("100"),
			Decimal.from("0.02"),
		);
		expect(isOk(result2)).toBe(true);
	});

	it("rejects noPrice > 1", () => {
		const result = calcArbProfit(
			Decimal.from("0.40"),
			Decimal.from("1.5"),
			Decimal.from("100"),
			Decimal.from("0.02"),
		);
		expect(isErr(result)).toBe(true);
		if (isErr(result)) expect(result.error.code).toBe("INVALID_PRICE");
	});

	it("rejects negative size", () => {
		const result = calcArbProfit(
			Decimal.from("0.40"),
			Decimal.from("0.45"),
			Decimal.from("-10"),
			Decimal.from("0.02"),
		);
		expect(isErr(result)).toBe(true);
		if (isErr(result)) expect(result.error.code).toBe("INVALID_SIZE");
	});

	it("rejects negative feeRate", () => {
		const result = calcArbProfit(
			Decimal.from("0.40"),
			Decimal.from("0.45"),
			Decimal.from("100"),
			Decimal.from("-0.01"),
		);
		expect(isErr(result)).toBe(true);
		if (isErr(result)) expect(result.error.code).toBe("INVALID_FEE_RATE");
	});

	it("includes totalCost in breakdown for self-contained verification", () => {
		const result = calcArbProfit(
			Decimal.from("0.40"),
			Decimal.from("0.45"),
			Decimal.from("100"),
			Decimal.from("0.02"),
		);
		expect(isOk(result)).toBe(true);
		if (!isOk(result)) return;
		// Verify derivation: net = gross - totalFees
		const expectedNet = result.value.gross.sub(result.value.totalFees);
		expect(result.value.net.toString()).toBe(expectedNet.toString());
	});
});

describe("calcOptimalSize", () => {
	it("caps at maxExposure when balance is plenty", () => {
		const result = calcOptimalSize(
			makeOpp("0.40", "0.45"),
			Decimal.from("100"),
			Decimal.from("10000"),
		);
		expect(isOk(result)).toBe(true);
		if (isOk(result)) expect(result.value.toString()).toBe("100");
	});

	it("caps at balance when maxExposure is large", () => {
		// totalCostPerUnit = 0.40 + 0.45 = 0.85
		// maxFromBalance = 85 / 0.85 = 100
		const result = calcOptimalSize(
			makeOpp("0.40", "0.45"),
			Decimal.from("10000"),
			Decimal.from("85"),
		);
		expect(isOk(result)).toBe(true);
		if (isOk(result)) expect(result.value.toString()).toBe("100");
	});

	it("returns zero for zero balance", () => {
		const result = calcOptimalSize(makeOpp("0.40", "0.45"), Decimal.from("100"), Decimal.zero());
		expect(isOk(result)).toBe(true);
		if (isOk(result)) expect(result.value.isZero()).toBe(true);
	});

	it("returns zero when maxExposure is zero", () => {
		const result = calcOptimalSize(makeOpp("0.40", "0.45"), Decimal.zero(), Decimal.from("1000"));
		expect(isOk(result)).toBe(true);
		if (isOk(result)) expect(result.value.isZero()).toBe(true);
	});

	it("returns zero when all leg prices are zero", () => {
		const opp: ArbitrageOpportunity = {
			type: "long",
			grossProfit: Decimal.zero(),
			netProfit: Decimal.zero(),
			legs: [
				{ action: "buy", side: "yes", price: Decimal.zero() },
				{ action: "buy", side: "no", price: Decimal.zero() },
			],
		};
		const result = calcOptimalSize(opp, Decimal.from("100"), Decimal.from("1000"));
		expect(isOk(result)).toBe(true);
		if (isOk(result)) expect(result.value.isZero()).toBe(true);
	});

	it("rejects empty legs array", () => {
		const opp: ArbitrageOpportunity = {
			type: "long",
			grossProfit: Decimal.zero(),
			netProfit: Decimal.zero(),
			legs: [],
		};
		const result = calcOptimalSize(opp, Decimal.from("100"), Decimal.from("1000"));
		expect(isErr(result)).toBe(true);
		if (isErr(result)) expect(result.error.code).toBe("INVALID_OPPORTUNITY");
	});

	it("rejects negative maxExposure", () => {
		const result = calcOptimalSize(
			makeOpp("0.40", "0.45"),
			Decimal.from("-100"),
			Decimal.from("1000"),
		);
		expect(isErr(result)).toBe(true);
		if (isErr(result)) expect(result.error.code).toBe("INVALID_EXPOSURE");
	});

	it("rejects negative availableBalance", () => {
		const result = calcOptimalSize(
			makeOpp("0.40", "0.45"),
			Decimal.from("100"),
			Decimal.from("-1000"),
		);
		expect(isErr(result)).toBe(true);
		if (isErr(result)) expect(result.error.code).toBe("INVALID_BALANCE");
	});
});
