import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { estimateImpact, optimalSize } from "./impact-model.js";
import type { ImpactConfig, ImpactInput } from "./impact-model.js";

describe("estimateImpact", () => {
	const defaultConfig: ImpactConfig = {
		eta: Decimal.from("0.1"),
		gamma: Decimal.from("0.1"),
	};

	describe("basic impact calculation", () => {
		it("calculates temporary impact = eta * volatility * sqrt(orderSize / adv)", () => {
			const input: ImpactInput = {
				orderSize: Decimal.from("1000"),
				adv: Decimal.from("10000"),
				volatility: Decimal.from("0.2"),
				price: Decimal.from("0.5"),
			};

			const result = estimateImpact(input, defaultConfig);

			// sqrt(1000/10000) = sqrt(0.1) = 0.316227766...
			// eta * vol * sqrt(Q/ADV) = 0.1 * 0.2 * 0.316227766 = 0.006324555...
			expect(result.temporaryImpact.toFixed(6)).toBe("0.006325");
		});

		it("calculates permanent impact = gamma * volatility * (orderSize / adv)", () => {
			const input: ImpactInput = {
				orderSize: Decimal.from("1000"),
				adv: Decimal.from("10000"),
				volatility: Decimal.from("0.2"),
				price: Decimal.from("0.5"),
			};

			const result = estimateImpact(input, defaultConfig);

			// Q/ADV = 1000/10000 = 0.1
			// gamma * vol * (Q/ADV) = 0.1 * 0.2 * 0.1 = 0.002
			expect(result.permanentImpact.toFixed(6)).toBe("0.002000");
		});

		it("sums temporary + permanent for total impact", () => {
			const input: ImpactInput = {
				orderSize: Decimal.from("1000"),
				adv: Decimal.from("10000"),
				volatility: Decimal.from("0.2"),
				price: Decimal.from("0.5"),
			};

			const result = estimateImpact(input, defaultConfig);

			// temporary = 0.006324555, permanent = 0.002
			// total = 0.008324555
			expect(result.totalImpact.toFixed(6)).toBe("0.008325");
		});

		it("calculates total impact percentage relative to price", () => {
			const input: ImpactInput = {
				orderSize: Decimal.from("1000"),
				adv: Decimal.from("10000"),
				volatility: Decimal.from("0.2"),
				price: Decimal.from("0.5"),
			};

			const result = estimateImpact(input, defaultConfig);

			// totalImpact / price = 0.008324555 / 0.5 = 0.01664911
			expect(result.totalImpactPct.toFixed(6)).toBe("0.016649");
		});

		it("calculates effective price = price * (1 + totalImpactPct)", () => {
			const input: ImpactInput = {
				orderSize: Decimal.from("1000"),
				adv: Decimal.from("10000"),
				volatility: Decimal.from("0.2"),
				price: Decimal.from("0.5"),
			};

			const result = estimateImpact(input, defaultConfig);

			// effectivePrice = 0.5 * (1 + 0.016649) = 0.5 * 1.016649 = 0.5083245
			expect(result.effectivePrice.toFixed(6)).toBe("0.508325");
		});
	});

	describe("zero order size edge case", () => {
		it("returns zero impact when order size is zero", () => {
			const input: ImpactInput = {
				orderSize: Decimal.zero(),
				adv: Decimal.from("10000"),
				volatility: Decimal.from("0.2"),
				price: Decimal.from("0.5"),
			};

			const result = estimateImpact(input, defaultConfig);

			expect(result.temporaryImpact.isZero()).toBe(true);
			expect(result.permanentImpact.isZero()).toBe(true);
			expect(result.totalImpact.isZero()).toBe(true);
			expect(result.totalImpactPct.isZero()).toBe(true);
			expect(result.effectivePrice.eq(Decimal.from("0.5"))).toBe(true);
		});
	});

	describe("zero ADV edge case", () => {
		it("returns zero impact when ADV is zero (div-by-zero guard)", () => {
			const input: ImpactInput = {
				orderSize: Decimal.from("1000"),
				adv: Decimal.zero(),
				volatility: Decimal.from("0.2"),
				price: Decimal.from("0.5"),
			};

			const result = estimateImpact(input, defaultConfig);

			expect(result.temporaryImpact.isZero()).toBe(true);
			expect(result.permanentImpact.isZero()).toBe(true);
			expect(result.totalImpact.isZero()).toBe(true);
			expect(result.totalImpactPct.isZero()).toBe(true);
			expect(result.effectivePrice.eq(Decimal.from("0.5"))).toBe(true);
		});
	});

	describe("zero price edge case", () => {
		it("returns zero impact when price is zero (div-by-zero guard)", () => {
			const input: ImpactInput = {
				orderSize: Decimal.from("1000"),
				adv: Decimal.from("10000"),
				volatility: Decimal.from("0.2"),
				price: Decimal.zero(),
			};

			const result = estimateImpact(input, defaultConfig);

			expect(result.temporaryImpact.isZero()).toBe(true);
			expect(result.permanentImpact.isZero()).toBe(true);
			expect(result.totalImpact.isZero()).toBe(true);
			expect(result.totalImpactPct.isZero()).toBe(true);
			expect(result.effectivePrice.isZero()).toBe(true);
		});
	});

	describe("default config", () => {
		it("uses default eta=0.1 and gamma=0.1 when config is omitted", () => {
			const input: ImpactInput = {
				orderSize: Decimal.from("1000"),
				adv: Decimal.from("10000"),
				volatility: Decimal.from("0.2"),
				price: Decimal.from("0.5"),
			};

			const result = estimateImpact(input);

			// Should match the explicit config results
			expect(result.temporaryImpact.toFixed(6)).toBe("0.006325");
			expect(result.permanentImpact.toFixed(6)).toBe("0.002000");
		});
	});

	describe("large order impact", () => {
		it("shows increasing impact for larger order sizes", () => {
			const base: ImpactInput = {
				orderSize: Decimal.from("1000"),
				adv: Decimal.from("10000"),
				volatility: Decimal.from("0.2"),
				price: Decimal.from("0.5"),
			};

			const large: ImpactInput = {
				...base,
				orderSize: Decimal.from("5000"),
			};

			const baseResult = estimateImpact(base, defaultConfig);
			const largeResult = estimateImpact(large, defaultConfig);

			// Larger order should have higher impact
			expect(largeResult.totalImpact.gt(baseResult.totalImpact)).toBe(true);
			expect(largeResult.totalImpactPct.gt(baseResult.totalImpactPct)).toBe(true);
		});

		it("shows sublinear growth for temporary impact (sqrt)", () => {
			const base: ImpactInput = {
				orderSize: Decimal.from("1000"),
				adv: Decimal.from("10000"),
				volatility: Decimal.from("0.2"),
				price: Decimal.from("0.5"),
			};

			const quadruple: ImpactInput = {
				...base,
				orderSize: Decimal.from("4000"),
			};

			const baseResult = estimateImpact(base, defaultConfig);
			const quadResult = estimateImpact(quadruple, defaultConfig);

			// 4x order size should yield 2x temporary impact (sqrt scaling)
			// base temp: eta * vol * sqrt(1000/10000) = 0.1 * 0.2 * sqrt(0.1)
			// quad temp: eta * vol * sqrt(4000/10000) = 0.1 * 0.2 * sqrt(0.4) = 0.1 * 0.2 * 2*sqrt(0.1)
			const ratio = quadResult.temporaryImpact.div(baseResult.temporaryImpact);
			expect(ratio.toFixed(2)).toBe("2.00");
		});

		it("shows linear growth for permanent impact", () => {
			const base: ImpactInput = {
				orderSize: Decimal.from("1000"),
				adv: Decimal.from("10000"),
				volatility: Decimal.from("0.2"),
				price: Decimal.from("0.5"),
			};

			const double: ImpactInput = {
				...base,
				orderSize: Decimal.from("2000"),
			};

			const baseResult = estimateImpact(base, defaultConfig);
			const doubleResult = estimateImpact(double, defaultConfig);

			// 2x order size should yield 2x permanent impact (linear scaling)
			const ratio = doubleResult.permanentImpact.div(baseResult.permanentImpact);
			expect(ratio.toFixed(2)).toBe("2.00");
		});
	});
});

describe("optimalSize", () => {
	const defaultConfig: ImpactConfig = {
		eta: Decimal.from("0.1"),
		gamma: Decimal.from("0.1"),
	};

	describe("inverse calculation", () => {
		it("returns order size that produces target slippage", () => {
			const maxSlippagePct = Decimal.from("0.02"); // 2% max slippage
			const adv = Decimal.from("10000");
			const volatility = Decimal.from("0.2");

			const size = optimalSize(maxSlippagePct, adv, volatility, defaultConfig);

			// Verify: estimate impact for this size should match target
			const verification = estimateImpact(
				{
					orderSize: size,
					adv,
					volatility,
					price: Decimal.one(), // price doesn't affect pct calc
				},
				defaultConfig,
			);

			expect(verification.totalImpactPct.toFixed(4)).toBe(maxSlippagePct.toFixed(4));
		});

		it("returns smaller size for tighter slippage budget", () => {
			const adv = Decimal.from("10000");
			const volatility = Decimal.from("0.2");

			const size1pct = optimalSize(Decimal.from("0.01"), adv, volatility, defaultConfig);
			const size2pct = optimalSize(Decimal.from("0.02"), adv, volatility, defaultConfig);

			expect(size1pct.lt(size2pct)).toBe(true);
		});

		it("uses default config when omitted", () => {
			const maxSlippagePct = Decimal.from("0.02");
			const adv = Decimal.from("10000");
			const volatility = Decimal.from("0.2");

			const sizeWithDefault = optimalSize(maxSlippagePct, adv, volatility);
			const sizeExplicit = optimalSize(maxSlippagePct, adv, volatility, defaultConfig);

			expect(sizeWithDefault.eq(sizeExplicit)).toBe(true);
		});
	});

	describe("zero slippage edge case", () => {
		it("returns zero size for zero slippage budget", () => {
			const size = optimalSize(
				Decimal.zero(),
				Decimal.from("10000"),
				Decimal.from("0.2"),
				defaultConfig,
			);

			expect(size.isZero()).toBe(true);
		});
	});

	describe("zero volatility edge case", () => {
		it("returns ADV when volatility is zero (zero impact, any size fits)", () => {
			const size = optimalSize(
				Decimal.from("0.02"),
				Decimal.from("10000"),
				Decimal.zero(),
				defaultConfig,
			);

			expect(size.eq(Decimal.from("10000"))).toBe(true);
		});
	});

	describe("high volatility scenarios", () => {
		it("returns smaller size for higher volatility", () => {
			const maxSlippagePct = Decimal.from("0.02");
			const adv = Decimal.from("10000");

			const sizeLowVol = optimalSize(maxSlippagePct, adv, Decimal.from("0.1"), defaultConfig);
			const sizeHighVol = optimalSize(maxSlippagePct, adv, Decimal.from("0.4"), defaultConfig);

			expect(sizeHighVol.lt(sizeLowVol)).toBe(true);
		});
	});
});
