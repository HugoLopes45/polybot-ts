import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { calcBollingerBands, calcEMA, calcRSI, calcSMA } from "./indicators.js";
import { calcAO, calcCCI, calcROC, calcStochastic, calcWilliamsR } from "./momentum-indicators.js";
import { calcADX, calcAroon, calcMACD } from "./trend-indicators.js";
import type { Candle } from "./types.js";
import { calcATR, calcDonchian } from "./volatility-indicators.js";

const createCandle = (close: number, i: number): Candle => ({
	timestampMs: i * 60000,
	open: Decimal.from(close),
	high: Decimal.from(close + 0.01),
	low: Decimal.from(close - 0.01),
	close: Decimal.from(close),
	volume: Decimal.from(1000),
});

describe("Indicators null-safety (property-based)", () => {
	const filterValidPrices = (arr: number[]): number[] => {
		return arr.filter((n) => Number.isFinite(n) && n > 0);
	};

	describe("SMA", () => {
		it("returns null for insufficient data", () => {
			fc.assert(
				fc.property(
					fc.array(fc.float({ min: Math.fround(0.01), max: Math.fround(100) }), { maxLength: 50 }),
					fc.nat(30),
					(fcloses, periodNum) => {
						const closes = filterValidPrices(fcloses).map((c) => Decimal.from(c));
						const period = Math.max(1, Math.abs(periodNum) + 1);

						const result = calcSMA(closes, period);
						if (closes.length < period) {
							expect(result).toBeNull();
						}
						return true;
					},
				),
				{ numRuns: 500 },
			);
		});
	});

	describe("EMA", () => {
		it("returns null for insufficient data", () => {
			fc.assert(
				fc.property(
					fc.array(fc.float({ min: Math.fround(0.01), max: Math.fround(100) }), { maxLength: 50 }),
					fc.nat(30),
					(fcloses, periodNum) => {
						const closes = filterValidPrices(fcloses).map((c) => Decimal.from(c));
						const period = Math.max(1, Math.abs(periodNum) + 1);

						const result = calcEMA(closes, period);
						if (closes.length < period) {
							expect(result).toBeNull();
						}
						return true;
					},
				),
				{ numRuns: 500 },
			);
		});
	});

	describe("RSI", () => {
		it("returns null for insufficient data", () => {
			fc.assert(
				fc.property(
					fc.array(fc.float({ min: Math.fround(0.01), max: Math.fround(100) }), { maxLength: 50 }),
					fc.nat(30),
					(fcloses, periodNum) => {
						const closes = filterValidPrices(fcloses).map((c) => Decimal.from(c));
						const period = Math.max(1, Math.abs(periodNum) + 1);

						const result = calcRSI(closes, period);
						if (closes.length < period + 1) {
							expect(result).toBeNull();
						}
						return true;
					},
				),
				{ numRuns: 500 },
			);
		});
	});

	describe("Bollinger Bands", () => {
		it("returns null for insufficient data", () => {
			fc.assert(
				fc.property(
					fc.array(fc.float({ min: Math.fround(0.01), max: Math.fround(100) }), { maxLength: 50 }),
					fc.nat(30),
					(fcloses, periodNum) => {
						const closes = filterValidPrices(fcloses).map((c) => Decimal.from(c));
						const period = Math.max(1, Math.abs(periodNum) + 1);

						const result = calcBollingerBands(closes, period);
						if (closes.length < period) {
							expect(result).toBeNull();
						}
						return true;
					},
				),
				{ numRuns: 500 },
			);
		});
	});

	describe("ATR", () => {
		it("returns null for insufficient data", () => {
			fc.assert(
				fc.property(
					fc.array(fc.float({ min: Math.fround(0.01), max: Math.fround(100) }), { maxLength: 30 }),
					fc.nat(30),
					(fprices, periodNum) => {
						const prices = filterValidPrices(fprices);
						const validPeriod = Math.max(1, Math.abs(periodNum) + 1);
						const candles = prices.slice(0, 30).map(createCandle);

						const result = calcATR(candles, validPeriod);
						if (candles.length < validPeriod) {
							expect(result).toBeNull();
						}
						return true;
					},
				),
				{ numRuns: 500 },
			);
		});
	});

	describe("Donchian", () => {
		it("returns null for insufficient data", () => {
			fc.assert(
				fc.property(
					fc.array(fc.float({ min: Math.fround(0.01), max: Math.fround(100) }), { maxLength: 30 }),
					fc.nat(30),
					(fprices, periodNum) => {
						const prices = filterValidPrices(fprices);
						const validPeriod = Math.max(1, Math.abs(periodNum) + 1);
						const candles = prices.slice(0, 30).map(createCandle);

						const result = calcDonchian(candles, validPeriod);
						if (candles.length < validPeriod) {
							expect(result).toBeNull();
						}
						return true;
					},
				),
				{ numRuns: 500 },
			);
		});
	});

	describe("MACD", () => {
		it("returns null for insufficient data", () => {
			fc.assert(
				fc.property(
					fc.array(fc.float({ min: Math.fround(0.01), max: Math.fround(100) }), { maxLength: 50 }),
					(fcloses) => {
						const closes = filterValidPrices(fcloses).map((c) => Decimal.from(c));

						const result = calcMACD(closes);
						if (closes.length < 34) {
							expect(result).toBeNull();
						}
						return true;
					},
				),
				{ numRuns: 500 },
			);
		});
	});

	describe("ADX", () => {
		it("returns null for insufficient data", () => {
			fc.assert(
				fc.property(
					fc.array(fc.float({ min: Math.fround(0.01), max: Math.fround(100) }), { maxLength: 50 }),
					fc.nat(30),
					(fprices, periodNum) => {
						const prices = filterValidPrices(fprices);
						const validPeriod = Math.max(1, Math.abs(periodNum) + 1);
						const candles = prices.slice(0, 50).map(createCandle);

						const result = calcADX(candles, validPeriod);
						if (candles.length < validPeriod * 2 + 1) {
							expect(result).toBeNull();
						}
						return true;
					},
				),
				{ numRuns: 500 },
			);
		});
	});

	describe("Aroon", () => {
		it("returns null for insufficient data", () => {
			fc.assert(
				fc.property(
					fc.array(fc.float({ min: Math.fround(0.01), max: Math.fround(100) }), { maxLength: 30 }),
					fc.nat(30),
					(fprices, periodNum) => {
						const prices = filterValidPrices(fprices);
						const validPeriod = Math.max(1, Math.abs(periodNum) + 1);
						const candles = prices.slice(0, 30).map(createCandle);

						const result = calcAroon(candles, validPeriod);
						if (candles.length < validPeriod + 1) {
							expect(result).toBeNull();
						}
						return true;
					},
				),
				{ numRuns: 500 },
			);
		});
	});

	describe("Stochastic", () => {
		it("returns null for insufficient data", () => {
			fc.assert(
				fc.property(
					fc.array(fc.float({ min: Math.fround(0.01), max: Math.fround(100) }), { maxLength: 30 }),
					fc.nat(30),
					(fprices, periodNum) => {
						const prices = filterValidPrices(fprices);
						const validPeriod = Math.max(1, Math.abs(periodNum) + 1);
						const candles = prices.slice(0, 30).map(createCandle);

						const result = calcStochastic(candles, validPeriod);
						if (candles.length < validPeriod) {
							expect(result).toBeNull();
						}
						return true;
					},
				),
				{ numRuns: 500 },
			);
		});
	});

	describe("Williams %R", () => {
		it("returns null for insufficient data", () => {
			fc.assert(
				fc.property(
					fc.array(fc.float({ min: Math.fround(0.01), max: Math.fround(100) }), { maxLength: 30 }),
					fc.nat(30),
					(fprices, periodNum) => {
						const prices = filterValidPrices(fprices);
						const validPeriod = Math.max(1, Math.abs(periodNum) + 1);
						const candles = prices.slice(0, 30).map(createCandle);

						const result = calcWilliamsR(candles, validPeriod);
						if (candles.length < validPeriod) {
							expect(result).toBeNull();
						}
						return true;
					},
				),
				{ numRuns: 500 },
			);
		});
	});

	describe("CCI", () => {
		it("returns null for insufficient data", () => {
			fc.assert(
				fc.property(
					fc.array(fc.float({ min: Math.fround(0.01), max: Math.fround(100) }), { maxLength: 30 }),
					fc.nat(30),
					(fprices, periodNum) => {
						const prices = filterValidPrices(fprices);
						const validPeriod = Math.max(1, Math.abs(periodNum) + 1);
						const candles = prices.slice(0, 30).map(createCandle);

						const result = calcCCI(candles, validPeriod);
						if (candles.length < validPeriod) {
							expect(result).toBeNull();
						}
						return true;
					},
				),
				{ numRuns: 500 },
			);
		});
	});

	describe("ROC", () => {
		it("returns null for insufficient data", () => {
			fc.assert(
				fc.property(
					fc.array(fc.float({ min: Math.fround(0.01), max: Math.fround(100) }), { maxLength: 50 }),
					fc.nat(30),
					(fcloses, periodNum) => {
						const closes = filterValidPrices(fcloses).map((c) => Decimal.from(c));
						const validPeriod = Math.max(1, Math.abs(periodNum) + 1);

						const result = calcROC(closes, validPeriod);
						if (closes.length < validPeriod + 1) {
							expect(result).toBeNull();
						}
						return true;
					},
				),
				{ numRuns: 500 },
			);
		});
	});

	describe("Awesome Oscillator", () => {
		it("returns null for insufficient data", () => {
			fc.assert(
				fc.property(
					fc.array(fc.float({ min: Math.fround(0.01), max: Math.fround(100) }), { maxLength: 50 }),
					(fprices) => {
						const prices = filterValidPrices(fprices);
						const candles = prices.slice(0, 50).map(createCandle);

						const result = calcAO(candles);
						if (candles.length < 34) {
							expect(result).toBeNull();
						}
						return true;
					},
				),
				{ numRuns: 500 },
			);
		});
	});
});
