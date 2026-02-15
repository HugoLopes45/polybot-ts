import { describe, expect, it, vi } from "vitest";
import type { Executor } from "../execution/types.js";
import { PendingState } from "../order/types.js";
import type { OrderResult } from "../order/types.js";
import { Decimal } from "../shared/decimal.js";
import { ErrorCategory, TradingError } from "../shared/errors.js";
import { conditionId } from "../shared/identifiers.js";
import type { ClientOrderId, ExchangeOrderId } from "../shared/identifiers.js";
import { err, isErr, isOk, ok } from "../shared/result.js";
import type { SdkOrderIntent } from "../signal/types.js";
import { ArbitrageExecutor, type ArbitrageExecutorConfig } from "./arbitrage-executor.js";
import type { ArbitrageOpportunity } from "./arbitrage.js";

const cid = conditionId("0x1234567890abcdef1234567890abcdef12345678");

const mockOrderResult: OrderResult = {
	clientOrderId: "test" as ClientOrderId,
	exchangeOrderId: "test" as ExchangeOrderId,
	finalState: PendingState.Filled,
	totalFilled: Decimal.one(),
	avgFillPrice: Decimal.one(),
};

const createMockExecutor = (shouldSucceed = true): Executor => ({
	submit: vi.fn().mockImplementation(async () => {
		if (shouldSucceed) {
			return ok(mockOrderResult);
		}
		return err(new TradingError("Execution failed", "EXECUTION_FAILED", ErrorCategory.Retryable));
	}),
	cancel: vi.fn().mockResolvedValue(ok(undefined)),
});

const defaultConfig: ArbitrageExecutorConfig = {
	feeRate: Decimal.from("0.02"),
	sizeSafetyFactor: Decimal.from("0.8"),
	minNetProfit: Decimal.from("1"),
	maxExposure: Decimal.from("1000"),
	availableBalance: Decimal.from("10000"),
};

describe("ArbitrageExecutor", () => {
	describe("create", () => {
		it("rejects config with negative feeRate", () => {
			const mockExecutor = createMockExecutor();
			const config = { ...defaultConfig, feeRate: Decimal.from("-0.01") };

			const result = ArbitrageExecutor.create(mockExecutor, config);

			expect(isErr(result)).toBe(true);
			if (isErr(result)) {
				expect(result.error.code).toBe("INVALID_CONFIG");
			}
		});

		it("rejects config with feeRate > 1", () => {
			const mockExecutor = createMockExecutor();
			const config = { ...defaultConfig, feeRate: Decimal.from("1.5") };

			const result = ArbitrageExecutor.create(mockExecutor, config);

			expect(isErr(result)).toBe(true);
			if (isErr(result)) {
				expect(result.error.code).toBe("INVALID_CONFIG");
			}
		});

		it("rejects config with zero maxExposure", () => {
			const mockExecutor = createMockExecutor();
			const config = { ...defaultConfig, maxExposure: Decimal.zero() };

			const result = ArbitrageExecutor.create(mockExecutor, config);

			expect(isErr(result)).toBe(true);
			if (isErr(result)) {
				expect(result.error.code).toBe("INVALID_CONFIG");
			}
		});

		it("rejects config with sizeSafetyFactor > 1", () => {
			const mockExecutor = createMockExecutor();
			const config = { ...defaultConfig, sizeSafetyFactor: Decimal.from("1.5") };

			const result = ArbitrageExecutor.create(mockExecutor, config);

			expect(isErr(result)).toBe(true);
			if (isErr(result)) {
				expect(result.error.code).toBe("INVALID_CONFIG");
			}
		});

		it("rejects config with zero sizeSafetyFactor", () => {
			const mockExecutor = createMockExecutor();
			const config = { ...defaultConfig, sizeSafetyFactor: Decimal.zero() };

			const result = ArbitrageExecutor.create(mockExecutor, config);

			expect(isErr(result)).toBe(true);
			if (isErr(result)) {
				expect(result.error.code).toBe("INVALID_CONFIG");
			}
		});

		it("rejects config with negative minNetProfit", () => {
			const mockExecutor = createMockExecutor();
			const config = { ...defaultConfig, minNetProfit: Decimal.from("-5") };

			const result = ArbitrageExecutor.create(mockExecutor, config);

			expect(isErr(result)).toBe(true);
			if (isErr(result)) {
				expect(result.error.code).toBe("INVALID_CONFIG");
			}
		});

		it("accepts valid config", () => {
			const mockExecutor = createMockExecutor();

			const result = ArbitrageExecutor.create(mockExecutor, defaultConfig);

			expect(isOk(result)).toBe(true);
		});
	});

	describe("execute", () => {
		it("executes long arbitrage (buy yes + buy no)", async () => {
			const mockExecutor = createMockExecutor();
			const executorResult = ArbitrageExecutor.create(mockExecutor, defaultConfig);
			expect(isOk(executorResult)).toBe(true);
			if (!isOk(executorResult)) return;
			const executor = executorResult.value;
			const opportunity: ArbitrageOpportunity = {
				type: "long",
				grossProfit: Decimal.from("0.15"),
				netProfit: Decimal.from("13"),
				legs: [
					{ action: "buy", side: "yes", price: Decimal.from("0.40") },
					{ action: "buy", side: "no", price: Decimal.from("0.45") },
				],
			};

			const result = await executor.execute(opportunity, cid);

			expect(isOk(result)).toBe(true);
			if (!isOk(result)) return;
			expect(mockExecutor.submit).toHaveBeenCalledTimes(2);
			expect(result.value.results.length).toBe(2);
		});

		it("executes short arbitrage (sell yes + sell no)", async () => {
			const mockExecutor = createMockExecutor();
			const executorResult = ArbitrageExecutor.create(mockExecutor, defaultConfig);
			expect(isOk(executorResult)).toBe(true);
			if (!isOk(executorResult)) return;
			const executor = executorResult.value;
			const opportunity: ArbitrageOpportunity = {
				type: "short",
				grossProfit: Decimal.from("0.10"),
				netProfit: Decimal.from("8"),
				legs: [
					{ action: "sell", side: "yes", price: Decimal.from("0.55") },
					{ action: "sell", side: "no", price: Decimal.from("0.50") },
				],
			};

			const result = await executor.execute(opportunity, cid);

			expect(isOk(result)).toBe(true);
			if (!isOk(result)) return;
			expect(mockExecutor.submit).toHaveBeenCalledTimes(2);
			expect(result.value.results.length).toBe(2);
		});

		it("rejects when net profit below minNetProfit", async () => {
			const mockExecutor = createMockExecutor();
			const config = { ...defaultConfig, minNetProfit: Decimal.from("100") };
			const executorResult = ArbitrageExecutor.create(mockExecutor, config);
			expect(isOk(executorResult)).toBe(true);
			if (!isOk(executorResult)) return;
			const executor = executorResult.value;
			const opportunity: ArbitrageOpportunity = {
				type: "long",
				grossProfit: Decimal.from("0.05"),
				netProfit: Decimal.from("3"),
				legs: [
					{ action: "buy", side: "yes", price: Decimal.from("0.40") },
					{ action: "buy", side: "no", price: Decimal.from("0.45") },
				],
			};

			const result = await executor.execute(opportunity, cid);

			expect(isErr(result)).toBe(true);
			if (isErr(result)) {
				expect(result.error.code).toBe("INSUFFICIENT_PROFIT");
			}
		});

		it("applies sizeSafetyFactor to calculate size", async () => {
			const mockExecutor = createMockExecutor();
			const config = { ...defaultConfig, sizeSafetyFactor: Decimal.from("0.5") };
			const executorResult = ArbitrageExecutor.create(mockExecutor, config);
			expect(isOk(executorResult)).toBe(true);
			if (!isOk(executorResult)) return;
			const executor = executorResult.value;
			const opportunity: ArbitrageOpportunity = {
				type: "long",
				grossProfit: Decimal.from("0.15"),
				netProfit: Decimal.from("13"),
				legs: [
					{ action: "buy", side: "yes", price: Decimal.from("0.40") },
					{ action: "buy", side: "no", price: Decimal.from("0.45") },
				],
			};

			await executor.execute(opportunity, cid);

			expect(mockExecutor.submit).toHaveBeenCalled();
		});

		it("returns error when executor fails and attempts rollback", async () => {
			let callCount = 0;
			const mockExecutor: Executor = {
				submit: vi.fn().mockImplementation(async () => {
					callCount++;
					if (callCount === 1) {
						return ok(mockOrderResult);
					}
					return err(
						new TradingError("Execution failed", "EXECUTION_FAILED", ErrorCategory.Retryable),
					);
				}),
				cancel: vi.fn().mockResolvedValue(ok(undefined)),
			};

			const executorResult = ArbitrageExecutor.create(mockExecutor, defaultConfig);
			expect(isOk(executorResult)).toBe(true);
			if (!isOk(executorResult)) return;
			const executor = executorResult.value;

			const opportunity: ArbitrageOpportunity = {
				type: "long",
				grossProfit: Decimal.from("0.15"),
				netProfit: Decimal.from("13"),
				legs: [
					{ action: "buy", side: "yes", price: Decimal.from("0.40") },
					{ action: "buy", side: "no", price: Decimal.from("0.45") },
				],
			};

			const result = await executor.execute(opportunity, cid);

			expect(isErr(result)).toBe(true);
			if (isErr(result)) {
				expect(result.error.message).toContain("Partial execution");
				expect(mockExecutor.cancel).toHaveBeenCalledTimes(1);
				expect(mockExecutor.cancel).toHaveBeenCalledWith(mockOrderResult.clientOrderId);
			}
		});

		it("returns error for zero-size arbitrage path", async () => {
			const mockExecutor = createMockExecutor();
			const config = { ...defaultConfig, availableBalance: Decimal.zero() };
			const executorResult = ArbitrageExecutor.create(mockExecutor, config);
			expect(isOk(executorResult)).toBe(true);
			if (!isOk(executorResult)) return;
			const executor = executorResult.value;

			const opportunity: ArbitrageOpportunity = {
				type: "long",
				grossProfit: Decimal.from("0.15"),
				netProfit: Decimal.from("13"),
				legs: [
					{ action: "buy", side: "yes", price: Decimal.from("0.40") },
					{ action: "buy", side: "no", price: Decimal.from("0.45") },
				],
			};

			const result = await executor.execute(opportunity, cid);

			expect(isErr(result)).toBe(true);
			if (isErr(result)) {
				expect(result.error.code).toBe("INSUFFICIENT_LIQUIDITY");
			}
		});

		it("calculates optimal size based on balance and exposure", async () => {
			const mockExecutor = createMockExecutor();
			const config = {
				...defaultConfig,
				maxExposure: Decimal.from("62.5"),
				availableBalance: Decimal.from("42.5"),
				sizeSafetyFactor: Decimal.from("0.8"),
			};
			const executorResult = ArbitrageExecutor.create(mockExecutor, config);
			expect(isOk(executorResult)).toBe(true);
			if (!isOk(executorResult)) return;
			const executor = executorResult.value;
			const opportunity: ArbitrageOpportunity = {
				type: "long",
				grossProfit: Decimal.from("0.15"),
				netProfit: Decimal.from("13"),
				legs: [
					{ action: "buy", side: "yes", price: Decimal.from("0.40") },
					{ action: "buy", side: "no", price: Decimal.from("0.45") },
				],
			};

			await executor.execute(opportunity, cid);

			const calls = mockExecutor.submit.mock.calls;
			expect(calls.length).toBe(2);
			const firstOrder = calls[0][0] as SdkOrderIntent;
			expect(firstOrder.size.toString()).toBe("50");
		});

		it("returns Result error (not throw) for leg with zero price", async () => {
			const mockExecutor = createMockExecutor();
			const executorResult = ArbitrageExecutor.create(mockExecutor, defaultConfig);
			expect(isOk(executorResult)).toBe(true);
			if (!isOk(executorResult)) return;
			const executor = executorResult.value;
			const opportunity: ArbitrageOpportunity = {
				type: "long",
				grossProfit: Decimal.from("0.15"),
				netProfit: Decimal.from("13"),
				legs: [
					{ action: "buy", side: "yes", price: Decimal.from("0.40") },
					{ action: "buy", side: "no", price: Decimal.zero() },
				],
			};

			const result = await executor.execute(opportunity, cid);

			expect(isErr(result)).toBe(true);
			if (isErr(result)) {
				expect(result.error.code).toBe("INVALID_PRICE");
			}
		});

		it("includes cancel outcomes in partial execution error", async () => {
			let callCount = 0;
			const mockExecutor: Executor = {
				submit: vi.fn().mockImplementation(async () => {
					callCount++;
					if (callCount === 1) {
						return ok(mockOrderResult);
					}
					return err(
						new TradingError("Execution failed", "EXECUTION_FAILED", ErrorCategory.Retryable),
					);
				}),
				cancel: vi.fn().mockResolvedValue(ok(undefined)),
			};

			const executorResult = ArbitrageExecutor.create(mockExecutor, defaultConfig);
			expect(isOk(executorResult)).toBe(true);
			if (!isOk(executorResult)) return;
			const executor = executorResult.value;

			const opportunity: ArbitrageOpportunity = {
				type: "long",
				grossProfit: Decimal.from("0.15"),
				netProfit: Decimal.from("13"),
				legs: [
					{ action: "buy", side: "yes", price: Decimal.from("0.40") },
					{ action: "buy", side: "no", price: Decimal.from("0.45") },
				],
			};

			const result = await executor.execute(opportunity, cid);

			expect(isErr(result)).toBe(true);
			if (isErr(result)) {
				expect(result.error.context).toHaveProperty("cancelOutcomes");
			}
		});
	});

	describe("validateOpportunity (via execute)", () => {
		it("returns ok for profitable opportunity above threshold", async () => {
			const mockExecutor = createMockExecutor();
			const executorResult = ArbitrageExecutor.create(mockExecutor, defaultConfig);
			expect(isOk(executorResult)).toBe(true);
			if (!isOk(executorResult)) return;
			const executor = executorResult.value;
			const opportunity: ArbitrageOpportunity = {
				type: "long",
				grossProfit: Decimal.from("0.15"),
				netProfit: Decimal.from("50"),
				legs: [
					{ action: "buy", side: "yes", price: Decimal.from("0.40") },
					{ action: "buy", side: "no", price: Decimal.from("0.45") },
				],
			};

			const result = await executor.execute(opportunity, cid);

			expect(isOk(result)).toBe(true);
		});

		it("returns error when net profit too low", async () => {
			const mockExecutor = createMockExecutor();
			const executorResult = ArbitrageExecutor.create(mockExecutor, defaultConfig);
			expect(isOk(executorResult)).toBe(true);
			if (!isOk(executorResult)) return;
			const executor = executorResult.value;
			const opportunity: ArbitrageOpportunity = {
				type: "long",
				grossProfit: Decimal.from("0.01"),
				netProfit: Decimal.from("0.5"),
				legs: [
					{ action: "buy", side: "yes", price: Decimal.from("0.40") },
					{ action: "buy", side: "no", price: Decimal.from("0.45") },
				],
			};

			const result = await executor.execute(opportunity, cid);

			expect(isErr(result)).toBe(true);
			if (isErr(result)) {
				expect(result.error.code).toBe("INSUFFICIENT_PROFIT");
			}
		});
	});
});
