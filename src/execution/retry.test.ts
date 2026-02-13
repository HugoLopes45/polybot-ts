import { afterEach, describe, expect, it, vi } from "vitest";
import { PendingState } from "../order/types.js";
import type { OrderResult } from "../order/types.js";
import { Decimal } from "../shared/decimal.js";
import { NetworkError, OrderRejectedError, RateLimitError } from "../shared/errors.js";
import type { TradingError } from "../shared/errors.js";
import {
	clientOrderId,
	conditionId,
	exchangeOrderId,
	marketTokenId,
} from "../shared/identifiers.js";
import { MarketSide } from "../shared/market-side.js";
import type { Result } from "../shared/result.js";
import { err, isErr, isOk, ok } from "../shared/result.js";
import { OrderDirection } from "../signal/types.js";
import type { SdkOrderIntent } from "../signal/types.js";
import { computeDelay, withRetry } from "./retry.js";
import type { Executor } from "./types.js";

function fakeOrderResult(index: number): OrderResult {
	return {
		clientOrderId: clientOrderId(`c-${index}`),
		exchangeOrderId: exchangeOrderId(`e-${index}`),
		finalState: PendingState.Filled,
		totalFilled: Decimal.from("100"),
		avgFillPrice: Decimal.from("0.65"),
	};
}

function testIntent(): SdkOrderIntent {
	return {
		conditionId: conditionId("cond-1"),
		tokenId: marketTokenId("token-1"),
		side: MarketSide.Yes,
		direction: OrderDirection.Buy,
		price: Decimal.from("0.65"),
		size: Decimal.from("100"),
	};
}

function mockExecutor(
	submitResults: Result<OrderResult, TradingError>[],
): Executor & { callCount: number } {
	let callIndex = 0;
	const mock = {
		callCount: 0,
		submit: async () => {
			mock.callCount++;
			const result = submitResults[callIndex];
			callIndex++;
			if (!result) {
				return err(new NetworkError("ran out of mock results"));
			}
			return result;
		},
		cancel: async () => ok(undefined) as Result<void, TradingError>,
	};
	return mock;
}

describe("withRetry", () => {
	describe("submit", () => {
		it("passes through on first success", async () => {
			const inner = mockExecutor([ok(fakeOrderResult(1))]);
			const executor = withRetry(inner, {
				maxAttempts: 3,
				baseDelayMs: 0,
			});

			const result = await executor.submit(testIntent());

			expect(isOk(result)).toBe(true);
			expect(inner.callCount).toBe(1);
		});

		it("retries on retryable error then succeeds", async () => {
			const inner = mockExecutor([
				err(new NetworkError("connection reset")),
				ok(fakeOrderResult(2)),
			]);
			const executor = withRetry(inner, {
				maxAttempts: 3,
				baseDelayMs: 0,
			});

			const result = await executor.submit(testIntent());

			expect(isOk(result)).toBe(true);
			expect(inner.callCount).toBe(2);
		});

		it("does not retry on non-retryable error", async () => {
			const inner = mockExecutor([err(new OrderRejectedError("invalid order"))]);
			const executor = withRetry(inner, {
				maxAttempts: 3,
				baseDelayMs: 0,
			});

			const result = await executor.submit(testIntent());

			expect(isErr(result)).toBe(true);
			expect(inner.callCount).toBe(1);
		});

		it("respects maxAttempts and returns last error", async () => {
			const inner = mockExecutor([
				err(new NetworkError("fail 1")),
				err(new NetworkError("fail 2")),
				err(new NetworkError("fail 3")),
				err(new NetworkError("fail 4")),
				err(new NetworkError("fail 5")),
			]);
			const executor = withRetry(inner, {
				maxAttempts: 3,
				baseDelayMs: 0,
			});

			const result = await executor.submit(testIntent());

			expect(isErr(result)).toBe(true);
			if (result.ok) return;
			expect(result.error.message).toBe("fail 3");
			expect(inner.callCount).toBe(3);
		});

		it("retries on RateLimitError (retryable)", async () => {
			const inner = mockExecutor([
				err(new RateLimitError("rate limited", 100)),
				ok(fakeOrderResult(3)),
			]);
			const executor = withRetry(inner, {
				maxAttempts: 3,
				baseDelayMs: 0,
			});

			const result = await executor.submit(testIntent());

			expect(isOk(result)).toBe(true);
			expect(inner.callCount).toBe(2);
		});

		it("handles single maxAttempt (no retries)", async () => {
			const inner = mockExecutor([err(new NetworkError("first fail"))]);
			const executor = withRetry(inner, {
				maxAttempts: 1,
				baseDelayMs: 0,
			});

			const result = await executor.submit(testIntent());

			expect(isErr(result)).toBe(true);
			expect(inner.callCount).toBe(1);
		});

		it("succeeds on last allowed attempt", async () => {
			const inner = mockExecutor([
				err(new NetworkError("fail 1")),
				err(new NetworkError("fail 2")),
				ok(fakeOrderResult(4)),
			]);
			const executor = withRetry(inner, {
				maxAttempts: 3,
				baseDelayMs: 0,
			});

			const result = await executor.submit(testIntent());

			expect(isOk(result)).toBe(true);
			expect(inner.callCount).toBe(3);
		});

		it("returns the successful OrderResult value", async () => {
			const expected = fakeOrderResult(42);
			const inner = mockExecutor([ok(expected)]);
			const executor = withRetry(inner, {
				maxAttempts: 3,
				baseDelayMs: 0,
			});

			const result = await executor.submit(testIntent());

			expect(isOk(result)).toBe(true);
			if (!result.ok) return;
			expect(result.value.clientOrderId as unknown as string).toBe("c-42");
		});
	});

	describe("jitter bidirectional (BUG-5)", () => {
		afterEach(() => {
			vi.restoreAllMocks();
		});

		it("jitter multiplier < 1 when Math.random returns 0", () => {
			// formula: 1 + (rand - 0.5) * 2 * jitterFactor
			// rand=0, jitterFactor=0.5 → 1 + (0 - 0.5)*2*0.5 = 0.5
			// delay = baseDelayMs * 2^attempt * 0.5 = 100 * 1 * 0.5 = 50
			vi.spyOn(Math, "random").mockReturnValue(0);
			const config = { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 10000, jitterFactor: 0.5 };
			const delay = computeDelay(0, config, new NetworkError("test"));
			expect(delay).toBe(50); // below base of 100
		});

		it("jitter multiplier > 1 when Math.random returns 1", () => {
			// rand=1, jitterFactor=0.5 → 1 + (1 - 0.5)*2*0.5 = 1.5
			// delay = 100 * 1 * 1.5 = 150
			vi.spyOn(Math, "random").mockReturnValue(1);
			const config = { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 10000, jitterFactor: 0.5 };
			const delay = computeDelay(0, config, new NetworkError("test"));
			expect(delay).toBe(150); // above base of 100
		});

		it("jitter is symmetric around the base delay", () => {
			const config = { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 10000, jitterFactor: 0.5 };
			vi.spyOn(Math, "random").mockReturnValue(0);
			const low = computeDelay(0, config, new NetworkError("test"));
			vi.spyOn(Math, "random").mockReturnValue(1);
			const high = computeDelay(0, config, new NetworkError("test"));
			// low and high should be equidistant from base
			expect(100 - low).toBe(high - 100); // 50 = 50
		});
	});

	describe("maxAttempts=0 (HARD-19)", () => {
		it("makes exactly one attempt with no retries when maxAttempts=0", async () => {
			const inner = mockExecutor([ok(fakeOrderResult(1))]);
			const executor = withRetry(inner, {
				maxAttempts: 0,
				baseDelayMs: 0,
			});
			await executor.submit(testIntent());
			// First call is always made; maxAttempts=0 means the retry loop never iterates
			expect(inner.callCount).toBe(1);
		});
	});

	describe("maxAttempts semantics (HARD-20)", () => {
		it("maxAttempts=1 means exactly one attempt (no retry)", async () => {
			const inner = mockExecutor([err(new NetworkError("only try"))]);
			const executor = withRetry(inner, {
				maxAttempts: 1,
				baseDelayMs: 0,
			});
			await executor.submit(testIntent());
			expect(inner.callCount).toBe(1);
		});

		it("maxAttempts=3 makes up to 3 calls total", async () => {
			const inner = mockExecutor([
				err(new NetworkError("1")),
				err(new NetworkError("2")),
				err(new NetworkError("3")),
				err(new NetworkError("4")),
			]);
			const executor = withRetry(inner, {
				maxAttempts: 3,
				baseDelayMs: 0,
			});
			await executor.submit(testIntent());
			expect(inner.callCount).toBe(3);
		});
	});

	describe("cancel", () => {
		it("passes through cancel without retry", async () => {
			const inner = mockExecutor([]);
			const executor = withRetry(inner, {
				maxAttempts: 3,
				baseDelayMs: 0,
			});

			const result = await executor.cancel(clientOrderId("some-id"));

			expect(isOk(result)).toBe(true);
		});

		it("delegates cancel to inner executor", async () => {
			let cancelCalled = false;
			const inner: Executor = {
				submit: async () => ok(fakeOrderResult(1)),
				cancel: async () => {
					cancelCalled = true;
					return ok(undefined);
				},
			};
			const executor = withRetry(inner, {
				maxAttempts: 3,
				baseDelayMs: 0,
			});

			await executor.cancel(clientOrderId("test-id"));

			expect(cancelCalled).toBe(true);
		});
	});
});
