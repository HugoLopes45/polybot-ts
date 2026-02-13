import { describe, expect, it } from "vitest";
import { ClobClient } from "../lib/clob/client.js";
import type { ClobOrderResponse, ClobProviders } from "../lib/clob/types.js";
import { TokenBucketRateLimiter } from "../lib/http/rate-limiter.js";
import { PendingState } from "../order/types.js";
import { Decimal } from "../shared/decimal.js";
import { OrderNotFoundError } from "../shared/errors.js";
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
			const { executor } = makeExecutor({
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
			const { executor } = makeExecutor();

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
});
