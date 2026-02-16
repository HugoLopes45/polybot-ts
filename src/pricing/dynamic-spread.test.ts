import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { calcDynamicSpread } from "./dynamic-spread.js";
import type { SpreadConfig, SpreadInput } from "./dynamic-spread.js";

describe("calcDynamicSpread", () => {
	const defaultConfig: SpreadConfig = {
		baseSpreadBps: Decimal.from("50"), // 0.5%
		volMultiplier: Decimal.from("1.0"),
		minSpreadBps: Decimal.from("10"), // 0.1%
		maxSpreadBps: Decimal.from("200"), // 2.0%
	};

	describe("base spread calculation", () => {
		it("returns base spread when volatility is zero and no time pressure", () => {
			const input: SpreadInput = {
				volatility: Decimal.zero(),
				timeRemainingMs: 600_000, // 10 minutes
				inventorySkew: Decimal.zero(),
			};

			const result = calcDynamicSpread(input, defaultConfig);

			// halfSpread = baseSpread * (1 + volMultiplier * vol) = 50 * (1 + 1.0 * 0) = 50
			expect(result.halfSpreadBps.toFixed(2)).toBe("50.00");
			expect(result.bidOffset.eq(result.askOffset)).toBe(true);
		});

		it("returns symmetric offsets when inventory is zero", () => {
			const input: SpreadInput = {
				volatility: Decimal.from("0.2"),
				timeRemainingMs: 600_000,
				inventorySkew: Decimal.zero(),
			};

			const result = calcDynamicSpread(input, defaultConfig);

			expect(result.bidOffset.eq(result.askOffset)).toBe(true);
		});
	});

	describe("volatility effect", () => {
		it("increases spread proportionally to volatility", () => {
			const lowVol: SpreadInput = {
				volatility: Decimal.from("0.1"),
				timeRemainingMs: 600_000,
				inventorySkew: Decimal.zero(),
			};

			const highVol: SpreadInput = {
				volatility: Decimal.from("0.3"),
				timeRemainingMs: 600_000,
				inventorySkew: Decimal.zero(),
			};

			const lowResult = calcDynamicSpread(lowVol, defaultConfig);
			const highResult = calcDynamicSpread(highVol, defaultConfig);

			// lowVol: halfSpread = 50 * (1 + 1.0 * 0.1) = 50 * 1.1 = 55
			expect(lowResult.halfSpreadBps.toFixed(2)).toBe("55.00");

			// highVol: halfSpread = 50 * (1 + 1.0 * 0.3) = 50 * 1.3 = 65
			expect(highResult.halfSpreadBps.toFixed(2)).toBe("65.00");

			expect(highResult.halfSpreadBps.gt(lowResult.halfSpreadBps)).toBe(true);
		});

		it("applies volMultiplier to volatility impact", () => {
			const input: SpreadInput = {
				volatility: Decimal.from("0.2"),
				timeRemainingMs: 600_000,
				inventorySkew: Decimal.zero(),
			};

			const config2x: SpreadConfig = {
				...defaultConfig,
				volMultiplier: Decimal.from("2.0"),
			};

			const result1x = calcDynamicSpread(input, defaultConfig);
			const result2x = calcDynamicSpread(input, config2x);

			// 1x: halfSpread = 50 * (1 + 1.0 * 0.2) = 50 * 1.2 = 60
			expect(result1x.halfSpreadBps.toFixed(2)).toBe("60.00");

			// 2x: halfSpread = 50 * (1 + 2.0 * 0.2) = 50 * 1.4 = 70
			expect(result2x.halfSpreadBps.toFixed(2)).toBe("70.00");
		});
	});

	describe("time bucket multipliers", () => {
		it("multiplies spread by 2.0 when time remaining < 60s", () => {
			const input: SpreadInput = {
				volatility: Decimal.from("0.2"),
				timeRemainingMs: 30_000, // 30s
				inventorySkew: Decimal.zero(),
			};

			const result = calcDynamicSpread(input, defaultConfig);

			// halfSpread = 50 * (1 + 1.0 * 0.2) * 2.0 = 50 * 1.2 * 2.0 = 120
			expect(result.halfSpreadBps.toFixed(2)).toBe("120.00");
		});

		it("multiplies spread by 1.5 when time remaining < 180s but >= 60s", () => {
			const input: SpreadInput = {
				volatility: Decimal.from("0.2"),
				timeRemainingMs: 120_000, // 2 minutes
				inventorySkew: Decimal.zero(),
			};

			const result = calcDynamicSpread(input, defaultConfig);

			// halfSpread = 50 * (1 + 1.0 * 0.2) * 1.5 = 50 * 1.2 * 1.5 = 90
			expect(result.halfSpreadBps.toFixed(2)).toBe("90.00");
		});

		it("does not apply time multiplier when time remaining >= 180s", () => {
			const input: SpreadInput = {
				volatility: Decimal.from("0.2"),
				timeRemainingMs: 600_000, // 10 minutes
				inventorySkew: Decimal.zero(),
			};

			const result = calcDynamicSpread(input, defaultConfig);

			// halfSpread = 50 * (1 + 1.0 * 0.2) * 1.0 = 60
			expect(result.halfSpreadBps.toFixed(2)).toBe("60.00");
		});

		it("prioritizes < 60s multiplier over < 180s multiplier", () => {
			const input59s: SpreadInput = {
				volatility: Decimal.from("0.2"),
				timeRemainingMs: 59_000,
				inventorySkew: Decimal.zero(),
			};

			const input61s: SpreadInput = {
				volatility: Decimal.from("0.2"),
				timeRemainingMs: 61_000,
				inventorySkew: Decimal.zero(),
			};

			const result59 = calcDynamicSpread(input59s, defaultConfig);
			const result61 = calcDynamicSpread(input61s, defaultConfig);

			// 59s: 2.0x multiplier
			expect(result59.halfSpreadBps.toFixed(2)).toBe("120.00");
			// 61s: 1.5x multiplier
			expect(result61.halfSpreadBps.toFixed(2)).toBe("90.00");
		});
	});

	describe("inventory skew offset", () => {
		it("widens ask and narrows bid when long (negative skew)", () => {
			const input: SpreadInput = {
				volatility: Decimal.from("0.2"),
				timeRemainingMs: 600_000,
				inventorySkew: Decimal.from("-0.5"), // Long position
			};

			const result = calcDynamicSpread(input, defaultConfig);

			// halfSpread = 60 bps
			// bid = halfSpread * (1 + inventorySkew * 0.5) = 60 * (1 + (-0.5) * 0.5) = 60 * 0.75 = 45
			// ask = halfSpread * (1 - inventorySkew * 0.5) = 60 * (1 - (-0.5) * 0.5) = 60 * 1.25 = 75
			expect(result.bidOffset.toFixed(2)).toBe("45.00");
			expect(result.askOffset.toFixed(2)).toBe("75.00");

			// When long, we want to sell (widen ask to attract buyers)
			expect(result.askOffset.gt(result.bidOffset)).toBe(true);
		});

		it("widens bid and narrows ask when short (positive skew)", () => {
			const input: SpreadInput = {
				volatility: Decimal.from("0.2"),
				timeRemainingMs: 600_000,
				inventorySkew: Decimal.from("0.5"), // Short position
			};

			const result = calcDynamicSpread(input, defaultConfig);

			// halfSpread = 60 bps
			// bid = halfSpread * (1 + inventorySkew * 0.5) = 60 * (1 + 0.5 * 0.5) = 60 * 1.25 = 75
			// ask = halfSpread * (1 - inventorySkew * 0.5) = 60 * (1 - 0.5 * 0.5) = 60 * 0.75 = 45
			expect(result.bidOffset.toFixed(2)).toBe("75.00");
			expect(result.askOffset.toFixed(2)).toBe("45.00");

			// When short, we want to buy (widen bid to attract sellers)
			expect(result.bidOffset.gt(result.askOffset)).toBe(true);
		});

		it("maintains symmetry at inventory extremes", () => {
			const inputLong: SpreadInput = {
				volatility: Decimal.from("0.2"),
				timeRemainingMs: 600_000,
				inventorySkew: Decimal.from("-1.0"), // Max long
			};

			const inputShort: SpreadInput = {
				volatility: Decimal.from("0.2"),
				timeRemainingMs: 600_000,
				inventorySkew: Decimal.from("1.0"), // Max short
			};

			const longResult = calcDynamicSpread(inputLong, defaultConfig);
			const shortResult = calcDynamicSpread(inputShort, defaultConfig);

			// Max long: bid = 60 * (1 - 0.5) = 30, ask = 60 * (1 + 0.5) = 90
			expect(longResult.bidOffset.toFixed(2)).toBe("30.00");
			expect(longResult.askOffset.toFixed(2)).toBe("90.00");

			// Max short: bid = 60 * (1 + 0.5) = 90, ask = 60 * (1 - 0.5) = 30
			expect(shortResult.bidOffset.toFixed(2)).toBe("90.00");
			expect(shortResult.askOffset.toFixed(2)).toBe("30.00");
		});

		it("omits inventory skew when not provided", () => {
			const input: SpreadInput = {
				volatility: Decimal.from("0.2"),
				timeRemainingMs: 600_000,
				// inventorySkew omitted
			};

			const result = calcDynamicSpread(input, defaultConfig);

			// Should treat as zero skew (symmetric)
			expect(result.bidOffset.eq(result.askOffset)).toBe(true);
			expect(result.bidOffset.toFixed(2)).toBe("60.00");
		});
	});

	describe("min/max clamping", () => {
		it("clamps to minSpreadBps floor", () => {
			const input: SpreadInput = {
				volatility: Decimal.zero(),
				timeRemainingMs: 600_000,
				inventorySkew: Decimal.zero(),
			};

			const tightConfig: SpreadConfig = {
				baseSpreadBps: Decimal.from("5"), // Below min
				volMultiplier: Decimal.from("1.0"),
				minSpreadBps: Decimal.from("10"),
				maxSpreadBps: Decimal.from("200"),
			};

			const result = calcDynamicSpread(input, tightConfig);

			// baseSpread = 5, but clamped to min = 10
			expect(result.halfSpreadBps.toFixed(2)).toBe("10.00");
		});

		it("clamps to maxSpreadBps ceiling", () => {
			const input: SpreadInput = {
				volatility: Decimal.from("5.0"), // Very high vol
				timeRemainingMs: 30_000, // < 60s
				inventorySkew: Decimal.zero(),
			};

			const result = calcDynamicSpread(input, defaultConfig);

			// halfSpread = 50 * (1 + 1.0 * 5.0) * 2.0 = 50 * 6.0 * 2.0 = 600
			// Clamped to max = 200
			expect(result.halfSpreadBps.toFixed(2)).toBe("200.00");
		});

		it("clamps bid/ask offsets individually after inventory adjustment", () => {
			const input: SpreadInput = {
				volatility: Decimal.from("5.0"),
				timeRemainingMs: 30_000,
				inventorySkew: Decimal.from("-0.8"), // Long
			};

			const result = calcDynamicSpread(input, defaultConfig);

			// halfSpread before clamp = 600, clamped to 200
			// bid = 200 * (1 + (-0.8) * 0.5) = 200 * 0.6 = 120
			// ask = 200 * (1 - (-0.8) * 0.5) = 200 * 1.4 = 280, but clamped to 200
			expect(result.halfSpreadBps.toFixed(2)).toBe("200.00");
			expect(result.bidOffset.toFixed(2)).toBe("120.00");
			expect(result.askOffset.toFixed(2)).toBe("200.00");
		});

		it("clamps bid/ask below minSpreadBps after inventory adjustment", () => {
			const input: SpreadInput = {
				volatility: Decimal.zero(),
				timeRemainingMs: 600_000,
				inventorySkew: Decimal.from("0.9"), // Short
			};

			const config: SpreadConfig = {
				baseSpreadBps: Decimal.from("15"),
				volMultiplier: Decimal.from("1.0"),
				minSpreadBps: Decimal.from("10"),
				maxSpreadBps: Decimal.from("200"),
			};

			const result = calcDynamicSpread(input, config);

			// halfSpread = 15
			// bid = 15 * (1 + 0.9 * 0.5) = 15 * 1.45 = 21.75
			// ask = 15 * (1 - 0.9 * 0.5) = 15 * 0.55 = 8.25, but clamped to min = 10
			expect(result.halfSpreadBps.toFixed(2)).toBe("15.00");
			expect(result.bidOffset.toFixed(2)).toBe("21.75");
			expect(result.askOffset.toFixed(2)).toBe("10.00");
		});
	});

	describe("combined effects", () => {
		it("applies volatility + time + inventory adjustments in order", () => {
			const input: SpreadInput = {
				volatility: Decimal.from("0.3"),
				timeRemainingMs: 50_000, // < 60s
				inventorySkew: Decimal.from("-0.4"), // Long
			};

			const result = calcDynamicSpread(input, defaultConfig);

			// 1. Vol: halfSpread = 50 * (1 + 1.0 * 0.3) = 50 * 1.3 = 65
			// 2. Time: halfSpread = 65 * 2.0 = 130
			// 3. Inventory: bid = 130 * (1 + (-0.4) * 0.5) = 130 * 0.8 = 104
			//                ask = 130 * (1 - (-0.4) * 0.5) = 130 * 1.2 = 156
			expect(result.halfSpreadBps.toFixed(2)).toBe("130.00");
			expect(result.bidOffset.toFixed(2)).toBe("104.00");
			expect(result.askOffset.toFixed(2)).toBe("156.00");
		});
	});
});
