import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { marketTokenId } from "../shared/identifiers.js";
import { isErr, isOk } from "../shared/result.js";
import { Rebalancer, type RebalancerConfig, type TokenBalance } from "./rebalancer.js";

const defaultConfig: RebalancerConfig = {
	targetUsdcRatio: Decimal.from("0.5"),
	tolerance: Decimal.from("0.05"),
	minRebalanceUsdc: Decimal.from("10"),
};

describe("Rebalancer", () => {
	describe("create", () => {
		it("rejects negative minRebalanceUsdc", () => {
			const config = { ...defaultConfig, minRebalanceUsdc: Decimal.from("-10") };

			const result = Rebalancer.create(config);

			expect(isErr(result)).toBe(true);
			if (isErr(result)) {
				expect(result.error.code).toBe("INVALID_CONFIG");
			}
		});

		it("rejects negative targetUsdcRatio", () => {
			const config = { ...defaultConfig, targetUsdcRatio: Decimal.from("-0.1") };

			const result = Rebalancer.create(config);

			expect(isErr(result)).toBe(true);
			if (isErr(result)) {
				expect(result.error.code).toBe("INVALID_CONFIG");
			}
		});

		it("rejects targetUsdcRatio > 1", () => {
			const config = { ...defaultConfig, targetUsdcRatio: Decimal.from("1.5") };

			const result = Rebalancer.create(config);

			expect(isErr(result)).toBe(true);
			if (isErr(result)) {
				expect(result.error.code).toBe("INVALID_CONFIG");
			}
		});

		it("rejects negative tolerance", () => {
			const config = { ...defaultConfig, tolerance: Decimal.from("-0.05") };

			const result = Rebalancer.create(config);

			expect(isErr(result)).toBe(true);
			if (isErr(result)) {
				expect(result.error.code).toBe("INVALID_CONFIG");
			}
		});

		it("accepts valid config", () => {
			const result = Rebalancer.create(defaultConfig);

			expect(isOk(result)).toBe(true);
		});
	});

	describe("calculateRebalance", () => {
		it("returns no action when within tolerance", () => {
			const rebalancerResult = Rebalancer.create(defaultConfig);
			expect(isOk(rebalancerResult)).toBe(true);
			if (!isOk(rebalancerResult)) return;
			const rebalancer = rebalancerResult.value;
			const balances: TokenBalance[] = [
				{
					tokenId: marketTokenId("token-1"),
					balance: Decimal.from("1000"),
					usdcValue: Decimal.from("500"),
				},
			];
			const totalUsdc = Decimal.from("500");

			const result = rebalancer.calculateRebalance(balances, totalUsdc);

			expect(isOk(result)).toBe(true);
			if (!isOk(result)) return;
			expect(result.value.length).toBe(0);
		});

		it("returns sell action when token overweight", () => {
			const config = {
				...defaultConfig,
				targetUsdcRatio: Decimal.from("0.5"),
				tolerance: Decimal.from("0.1"),
			};
			const rebalancerResult = Rebalancer.create(config);
			expect(isOk(rebalancerResult)).toBe(true);
			if (!isOk(rebalancerResult)) return;
			const rebalancer = rebalancerResult.value;
			const balances: TokenBalance[] = [
				{
					tokenId: marketTokenId("token-1"),
					balance: Decimal.from("2000"),
					usdcValue: Decimal.from("1000"),
				},
			];
			const totalUsdc = Decimal.from("500");

			const result = rebalancer.calculateRebalance(balances, totalUsdc);

			expect(isOk(result)).toBe(true);
			if (!isOk(result)) return;
			expect(result.value.length).toBe(1);
			expect(result.value[0]?.action).toBe("sell");
		});

		it("returns buy action when usdc overweight", () => {
			const config = {
				...defaultConfig,
				targetUsdcRatio: Decimal.from("0.5"),
				tolerance: Decimal.from("0.1"),
			};
			const rebalancerResult = Rebalancer.create(config);
			expect(isOk(rebalancerResult)).toBe(true);
			if (!isOk(rebalancerResult)) return;
			const rebalancer = rebalancerResult.value;
			const balances: TokenBalance[] = [
				{
					tokenId: marketTokenId("token-1"),
					balance: Decimal.from("500"),
					usdcValue: Decimal.from("250"),
				},
			];
			const totalUsdc = Decimal.from("1000");

			const result = rebalancer.calculateRebalance(balances, totalUsdc);

			expect(isOk(result)).toBe(true);
			if (!isOk(result)) return;
			expect(result.value.length).toBe(1);
			expect(result.value[0]?.action).toBe("buy");
		});

		it("skips rebalance when amount below minRebalanceUsdc", () => {
			const config = { ...defaultConfig, minRebalanceUsdc: Decimal.from("300") };
			const rebalancerResult = Rebalancer.create(config);
			expect(isOk(rebalancerResult)).toBe(true);
			if (!isOk(rebalancerResult)) return;
			const rebalancer = rebalancerResult.value;
			const balances: TokenBalance[] = [
				{
					tokenId: marketTokenId("token-1"),
					balance: Decimal.from("100"),
					usdcValue: Decimal.from("50"),
				},
			];
			const totalUsdc = Decimal.from("500");

			const result = rebalancer.calculateRebalance(balances, totalUsdc);

			expect(isOk(result)).toBe(true);
			if (!isOk(result)) return;
			expect(result.value.length).toBe(0);
		});

		it("distributes targetTokenRatio across multiple tokens", () => {
			const config = {
				...defaultConfig,
				targetUsdcRatio: Decimal.from("0.4"),
				tolerance: Decimal.from("0.01"),
			};
			const rebalancerResult = Rebalancer.create(config);
			expect(isOk(rebalancerResult)).toBe(true);
			if (!isOk(rebalancerResult)) return;
			const rebalancer = rebalancerResult.value;

			const balances: TokenBalance[] = [
				{
					tokenId: marketTokenId("token-1"),
					balance: Decimal.from("500"),
					usdcValue: Decimal.from("100"),
				},
				{
					tokenId: marketTokenId("token-2"),
					balance: Decimal.from("500"),
					usdcValue: Decimal.from("100"),
				},
			];
			const totalUsdc = Decimal.from("800");

			const result = rebalancer.calculateRebalance(balances, totalUsdc);

			expect(isOk(result)).toBe(true);
			if (!isOk(result)) return;
			expect(result.value.length).toBeGreaterThan(0);
			const targetRatio = result.value[0]?.targetRatio;
			expect(targetRatio?.toString()).toBe("0.3");
		});

		it("handles multiple tokens with different imbalances", () => {
			const config = {
				...defaultConfig,
				targetUsdcRatio: Decimal.from("0.33"),
				tolerance: Decimal.from("0.05"),
			};
			const rebalancerResult = Rebalancer.create(config);
			expect(isOk(rebalancerResult)).toBe(true);
			if (!isOk(rebalancerResult)) return;
			const rebalancer = rebalancerResult.value;
			const balances: TokenBalance[] = [
				{
					tokenId: marketTokenId("token-1"),
					balance: Decimal.from("2000"),
					usdcValue: Decimal.from("1000"),
				},
				{
					tokenId: marketTokenId("token-2"),
					balance: Decimal.from("500"),
					usdcValue: Decimal.from("250"),
				},
			];
			const totalUsdc = Decimal.from("500");

			const result = rebalancer.calculateRebalance(balances, totalUsdc);

			expect(isOk(result)).toBe(true);
			if (!isOk(result)) return;
			expect(result.value.length).toBeGreaterThan(0);
		});
	});

	describe("getPortfolioRatio", () => {
		it("calculates correct USDC ratio", () => {
			const rebalancerResult = Rebalancer.create(defaultConfig);
			expect(isOk(rebalancerResult)).toBe(true);
			if (!isOk(rebalancerResult)) return;
			const rebalancer = rebalancerResult.value;
			const balances: TokenBalance[] = [
				{
					tokenId: marketTokenId("token-1"),
					balance: Decimal.from("1000"),
					usdcValue: Decimal.from("500"),
				},
			];
			const totalUsdc = Decimal.from("500");

			const ratio = rebalancer.getPortfolioRatio(balances, totalUsdc);

			expect(ratio.toString()).toBe("0.5");
		});

		it("returns 0 when no tokens and no usdc", () => {
			const rebalancerResult = Rebalancer.create(defaultConfig);
			expect(isOk(rebalancerResult)).toBe(true);
			if (!isOk(rebalancerResult)) return;
			const rebalancer = rebalancerResult.value;
			const balances: TokenBalance[] = [];
			const totalUsdc = Decimal.zero();

			const ratio = rebalancer.getPortfolioRatio(balances, totalUsdc);

			expect(ratio.toString()).toBe("0");
		});

		it("returns 1 when only usdc", () => {
			const rebalancerResult = Rebalancer.create(defaultConfig);
			expect(isOk(rebalancerResult)).toBe(true);
			if (!isOk(rebalancerResult)) return;
			const rebalancer = rebalancerResult.value;
			const balances: TokenBalance[] = [];
			const totalUsdc = Decimal.from("1000");

			const ratio = rebalancer.getPortfolioRatio(balances, totalUsdc);

			expect(ratio.toString()).toBe("1");
		});
	});
});
