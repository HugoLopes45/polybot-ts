import { describe, expect, it } from "vitest";
import { ClobClient } from "../lib/clob/client.js";
import type { ClobOrderResponse, ClobProviders } from "../lib/clob/types.js";
import { TokenBucketRateLimiter } from "../lib/http/rate-limiter.js";
import { PendingState } from "../order/types.js";
import { Decimal } from "../shared/decimal.js";
import { OrderNotFoundError, TimeoutError } from "../shared/errors.js";
import { conditionId, marketTokenId } from "../shared/identifiers.js";
import { MarketSide } from "../shared/market-side.js";
import { isErr, isOk } from "../shared/result.js";
import { FakeClock } from "../shared/time.js";
import { OrderDirection } from "../signal/types.js";
import type { SdkOrderIntent } from "../signal/types.js";
import { ClobExecutor } from "./clob-executor.js";

function testIntent(overrides?: Partial<SdkOrderIntent>): SdkOrderIntent {
	return {
		conditionId: conditionId("cond-1"),
		tokenId: marketTokenId("tok-1"),
		side: MarketSide.Yes,
		direction: OrderDirection.Buy,
		price: Decimal.from("0.55"),
		size: Decimal.from("10"),
		...overrides,
	};
}

const VALID_RESPONSE: ClobOrderResponse = {
	orderId: "exch-100",
	status: "MATCHED",
	filledSize: "10",
	avgPrice: "0.55",
};

function makeDeps(overrides: Partial<ClobProviders> = {}): ClobProviders {
	return {
		submitOrder: overrides.submitOrder ?? (() => Promise.resolve(VALID_RESPONSE)),
		cancelOrder: overrides.cancelOrder ?? (() => Promise.resolve()),
		getOpenOrders: overrides.getOpenOrders ?? (() => Promise.resolve([])),
	};
}

function makeExecutor(depsOverrides: Partial<ClobProviders> = {}) {
	const clock = new FakeClock(1000);
	const client = new ClobClient(makeDeps(depsOverrides));
	const limiter = new TokenBucketRateLimiter({
		capacity: 10,
		refillRate: 10,
		clock,
	});
	return { executor: new ClobExecutor(client, limiter), clock };
}

function makeExecutorWithTimeout(
	requestTimeoutMs: number,
	depsOverrides: Partial<ClobProviders> = {},
) {
	const clock = new FakeClock(1000);
	const client = new ClobClient(makeDeps(depsOverrides));
	const limiter = new TokenBucketRateLimiter({
		capacity: 10,
		refillRate: 10,
		clock,
	});
	return { executor: new ClobExecutor(client, limiter, requestTimeoutMs), clock };
}

describe("ClobExecutor", () => {
	describe("submit", () => {
		it("returns ok with mapped OrderResult on success", async () => {
			const { executor } = makeExecutor();
			const result = await executor.submit(testIntent());

			expect(isOk(result)).toBe(true);
			if (result.ok) {
				expect(result.value.exchangeOrderId).not.toBeNull();
				expect(result.value.finalState).toBe(PendingState.Filled);
				expect(result.value.totalFilled.eq(Decimal.from("10"))).toBe(true);
			}
		});

		it("maps ClobOrderResponse fields to OrderResult", async () => {
			const { executor } = makeExecutor();
			const result = await executor.submit(testIntent());

			if (result.ok) {
				expect(result.value.avgFillPrice?.eq(Decimal.from("0.55"))).toBe(true);
			}
		});

		it("generates sequential clientOrderIds", async () => {
			const { executor } = makeExecutor();
			const r1 = await executor.submit(testIntent());
			const r2 = await executor.submit(testIntent());

			if (r1.ok && r2.ok) {
				expect(r1.value.clientOrderId).not.toBe(r2.value.clientOrderId);
			}
		});

		it("classifies network errors from CLOB client", async () => {
			const { executor } = makeExecutor({
				submitOrder: () => Promise.reject(new Error("ECONNREFUSED")),
			});
			const result = await executor.submit(testIntent());

			expect(isErr(result)).toBe(true);
		});

		it("handles partial fill response", async () => {
			const partialResponse: ClobOrderResponse = {
				orderId: "exch-200",
				status: "OPEN",
				filledSize: "5",
				avgPrice: "0.55",
			};
			const { executor } = makeExecutor({
				submitOrder: () => Promise.resolve(partialResponse),
			});
			const result = await executor.submit(testIntent());

			expect(isOk(result)).toBe(true);
			if (result.ok) {
				expect(result.value.finalState).toBe(PendingState.PartiallyFilled);
				expect(result.value.totalFilled.eq(Decimal.from("5"))).toBe(true);
			}
		});

		it("builds correct wire-format request from intent", async () => {
			let capturedReq: unknown;
			const { executor } = makeExecutor({
				submitOrder: async (req) => {
					capturedReq = req;
					return VALID_RESPONSE;
				},
			});
			await executor.submit(testIntent());

			expect(capturedReq).toEqual({
				tokenId: "tok-1",
				price: "0.55",
				size: "10",
				side: "BUY",
				orderType: "GTC",
			});
		});
	});

	describe("cancel", () => {
		it("delegates cancel to ClobClient", async () => {
			let cancelledId: string | undefined;
			const openResponse: ClobOrderResponse = {
				orderId: "exch-cancel",
				status: "OPEN",
				filledSize: "0",
				avgPrice: "",
			};
			const { executor } = makeExecutor({
				submitOrder: () => Promise.resolve(openResponse),
				cancelOrder: async (id) => {
					cancelledId = id;
				},
			});

			const submitResult = await executor.submit(testIntent());
			if (submitResult.ok && submitResult.value.exchangeOrderId) {
				const result = await executor.cancel(submitResult.value.clientOrderId);
				expect(isOk(result)).toBe(true);
				expect(cancelledId).toBeDefined();
			}
		});

		it("propagates cancel errors", async () => {
			const { executor } = makeExecutor({
				cancelOrder: () => Promise.reject(new Error("ECONNREFUSED")),
			});
			const submitResult = await executor.submit(testIntent());
			if (submitResult.ok) {
				const result = await executor.cancel(submitResult.value.clientOrderId);
				expect(isErr(result)).toBe(true);
			}
		});

		it("removes from activeOrders after successful cancel (BUG-5)", async () => {
			const openResponse: ClobOrderResponse = {
				orderId: "exch-cancel",
				status: "OPEN",
				filledSize: "0",
				avgPrice: "",
			};
			const { executor } = makeExecutor({
				submitOrder: () => Promise.resolve(openResponse),
			});

			const submitResult = await executor.submit(testIntent());
			expect(isOk(submitResult)).toBe(true);
			if (!submitResult.ok) return;

			const firstCancel = await executor.cancel(submitResult.value.clientOrderId);
			expect(isOk(firstCancel)).toBe(true);

			const secondCancel = await executor.cancel(submitResult.value.clientOrderId);
			expect(isErr(secondCancel)).toBe(true);
			if (!secondCancel.ok) {
				expect(secondCancel.error).toBeInstanceOf(OrderNotFoundError);
			}
		});

		it("returns OrderNotFoundError for unknown orderId instead of sending garbage (BUG-3)", async () => {
			const { executor } = makeExecutor();
			const result = await executor.cancel(
				// biome-ignore lint/suspicious/noExplicitAny: test cast
				"never-submitted" as any,
			);
			expect(isErr(result)).toBe(true);
			if (!result.ok) {
				expect(result.error).toBeInstanceOf(OrderNotFoundError);
				expect(result.error.code).toBe("ORDER_NOT_FOUND");
				expect(result.error.message).toContain("never-submitted");
			}
		});
	});

	describe("status mapping edge cases (HARD-28)", () => {
		it("classifies partial fill with CANCELLED status as PartiallyFilled", async () => {
			const cancelledPartial: ClobOrderResponse = {
				orderId: "exch-400",
				status: "CANCELLED",
				filledSize: "5",
				avgPrice: "0.55",
			};
			const { executor } = makeExecutor({
				submitOrder: () => Promise.resolve(cancelledPartial),
			});
			const result = await executor.submit(testIntent());

			expect(isOk(result)).toBe(true);
			if (result.ok) {
				// Partial fill takes precedence over CANCELLED status
				expect(result.value.finalState).toBe(PendingState.PartiallyFilled);
				expect(result.value.totalFilled.eq(Decimal.from("5"))).toBe(true);
			}
		});

		it("classifies zero fill with CANCELLED status as Cancelled", async () => {
			const cancelledZero: ClobOrderResponse = {
				orderId: "exch-500",
				status: "CANCELLED",
				filledSize: "0",
				avgPrice: "",
			};
			const { executor } = makeExecutor({
				submitOrder: () => Promise.resolve(cancelledZero),
			});
			const result = await executor.submit(testIntent());

			expect(isOk(result)).toBe(true);
			if (result.ok) {
				expect(result.value.finalState).toBe(PendingState.Cancelled);
			}
		});

		it("classifies zero fill with unknown status as Open", async () => {
			const openOrder: ClobOrderResponse = {
				orderId: "exch-600",
				status: "PENDING",
				filledSize: "0",
				avgPrice: "",
			};
			const { executor } = makeExecutor({
				submitOrder: () => Promise.resolve(openOrder),
			});
			const result = await executor.submit(testIntent());

			expect(isOk(result)).toBe(true);
			if (result.ok) {
				expect(result.value.finalState).toBe(PendingState.Open);
			}
		});
	});

	describe("activeOrderCount", () => {
		it("returns 0 for fresh executor", async () => {
			const { executor } = makeExecutor();
			expect(executor.activeOrderCount()).toBe(0);
		});

		it("increments count on order submit for non-terminal orders", async () => {
			const openResponse: ClobOrderResponse = {
				orderId: "exch-open",
				status: "OPEN",
				filledSize: "0",
				avgPrice: "",
			};
			const { executor } = makeExecutor({
				submitOrder: () => Promise.resolve(openResponse),
			});
			await executor.submit(testIntent());
			expect(executor.activeOrderCount()).toBe(1);
		});

		it("decrements count after cancel", async () => {
			const openResponse: ClobOrderResponse = {
				orderId: "exch-cancel",
				status: "OPEN",
				filledSize: "0",
				avgPrice: "",
			};
			const { executor } = makeExecutor({
				submitOrder: () => Promise.resolve(openResponse),
			});
			const result = await executor.submit(testIntent());
			expect(isOk(result)).toBe(true);
			if (!result.ok) return;

			await executor.cancel(result.value.clientOrderId);
			expect(executor.activeOrderCount()).toBe(0);
		});
	});

	describe("terminal state cleanup (H4)", () => {
		it("removes order from activeOrders when finalState is Filled", async () => {
			const filledResponse: ClobOrderResponse = {
				orderId: "exch-filled",
				status: "MATCHED",
				filledSize: "10",
				avgPrice: "0.55",
			};
			const { executor } = makeExecutor({
				submitOrder: () => Promise.resolve(filledResponse),
			});

			const result = await executor.submit(testIntent());
			expect(isOk(result)).toBe(true);
			if (!result.ok) return;

			expect(result.value.finalState).toBe(PendingState.Filled);
			expect(executor.activeOrderCount()).toBe(0);
		});

		it("removes order from activeOrders when finalState is Cancelled", async () => {
			const cancelledResponse: ClobOrderResponse = {
				orderId: "exch-cancelled",
				status: "CANCELLED",
				filledSize: "0",
				avgPrice: "",
			};
			const { executor } = makeExecutor({
				submitOrder: () => Promise.resolve(cancelledResponse),
			});

			const result = await executor.submit(testIntent());
			expect(isOk(result)).toBe(true);
			if (!result.ok) return;

			expect(result.value.finalState).toBe(PendingState.Cancelled);
			expect(executor.activeOrderCount()).toBe(0);
		});

		it("removes order from activeOrders when finalState is Expired", async () => {
			const expiredResponse: ClobOrderResponse = {
				orderId: "exch-expired",
				status: "EXPIRED",
				filledSize: "0",
				avgPrice: "",
			};
			const { executor } = makeExecutor({
				submitOrder: () => Promise.resolve(expiredResponse),
			});

			const result = await executor.submit(testIntent());
			expect(isOk(result)).toBe(true);
			if (!result.ok) return;

			expect(result.value.finalState).toBe(PendingState.Expired);
			expect(executor.activeOrderCount()).toBe(0);
		});

		it("keeps order in activeOrders when finalState is Open", async () => {
			const openResponse: ClobOrderResponse = {
				orderId: "exch-open",
				status: "OPEN",
				filledSize: "0",
				avgPrice: "",
			};
			const { executor } = makeExecutor({
				submitOrder: () => Promise.resolve(openResponse),
			});

			const result = await executor.submit(testIntent());
			expect(isOk(result)).toBe(true);
			if (!result.ok) return;

			expect(result.value.finalState).toBe(PendingState.Open);
			expect(executor.activeOrderCount()).toBe(1);
		});

		it("keeps order in activeOrders when finalState is PartiallyFilled", async () => {
			const partialResponse: ClobOrderResponse = {
				orderId: "exch-partial",
				status: "OPEN",
				filledSize: "5",
				avgPrice: "0.55",
			};
			const { executor } = makeExecutor({
				submitOrder: () => Promise.resolve(partialResponse),
			});

			const result = await executor.submit(testIntent());
			expect(isOk(result)).toBe(true);
			if (!result.ok) return;

			expect(result.value.finalState).toBe(PendingState.PartiallyFilled);
			expect(executor.activeOrderCount()).toBe(1);
		});
	});

	describe("avgPrice edge cases (HARD-18)", () => {
		it("handles empty avgPrice string in response", async () => {
			const emptyAvg: ClobOrderResponse = {
				orderId: "exch-300",
				status: "MATCHED",
				filledSize: "10",
				avgPrice: "",
			};
			const { executor } = makeExecutor({
				submitOrder: () => Promise.resolve(emptyAvg),
			});
			const result = await executor.submit(testIntent());
			expect(isOk(result)).toBe(true);
			if (result.ok) {
				// Empty string is falsy, so avgFillPrice should be null
				expect(result.value.avgFillPrice).toBeNull();
			}
		});
	});

	describe("request timeout (M20)", () => {
		it("does not timeout when request completes within timeout", async () => {
			const { executor } = makeExecutorWithTimeout(100);
			const result = await executor.submit(testIntent());
			expect(isOk(result)).toBe(true);
		});

		it("times out submit request when exceeds timeout", async () => {
			const slowSubmit = () =>
				new Promise<ClobOrderResponse>((resolve) => setTimeout(() => resolve(VALID_RESPONSE), 200));
			const { executor } = makeExecutorWithTimeout(50, { submitOrder: slowSubmit });
			const result = await executor.submit(testIntent());
			expect(isErr(result)).toBe(true);
			if (!result.ok) {
				expect(result.error).toBeInstanceOf(TimeoutError);
				expect(result.error.code).toBe("TIMEOUT_ERROR");
			}
		});

		it("times out cancel request when exceeds timeout", async () => {
			const openResponse: ClobOrderResponse = {
				orderId: "exch-cancel",
				status: "OPEN",
				filledSize: "0",
				avgPrice: "",
			};
			const slowCancel = () => new Promise<void>((resolve) => setTimeout(() => resolve(), 200));
			const { executor } = makeExecutorWithTimeout(50, {
				submitOrder: () => Promise.resolve(openResponse),
				cancelOrder: slowCancel,
			});
			const submitResult = await executor.submit(testIntent());
			expect(isOk(submitResult)).toBe(true);
			if (!submitResult.ok) return;

			const cancelResult = await executor.cancel(submitResult.value.clientOrderId);
			expect(isErr(cancelResult)).toBe(true);
			if (!cancelResult.ok) {
				expect(cancelResult.error).toBeInstanceOf(TimeoutError);
			}
		});

		it("works without timeout when requestTimeoutMs not provided", async () => {
			const { executor } = makeExecutor();
			const result = await executor.submit(testIntent());
			expect(isOk(result)).toBe(true);
		});
	});
});
