import { describe, expect, it } from "vitest";
import { PendingState } from "../order/types.js";
import { Decimal } from "../shared/decimal.js";
import { clientOrderId, conditionId, marketTokenId } from "../shared/identifiers.js";
import { MarketSide } from "../shared/market-side.js";
import { isErr, isOk } from "../shared/result.js";
import { FakeClock } from "../shared/time.js";
import { OrderDirection } from "../signal/types.js";
import type { SdkOrderIntent } from "../signal/types.js";
import { PaperExecutor } from "./paper-executor.js";

const d = Decimal.from;

function testIntent(overrides?: Partial<SdkOrderIntent>): SdkOrderIntent {
	return {
		conditionId: conditionId("cond-1"),
		tokenId: marketTokenId("token-1"),
		side: MarketSide.Yes,
		direction: OrderDirection.Buy,
		price: d("0.65"),
		size: d("100"),
		...overrides,
	};
}

describe("PaperExecutor", () => {
	describe("submit", () => {
		it("fills fully with 100% probability (default config)", async () => {
			const executor = new PaperExecutor();
			const result = await executor.submit(testIntent());

			expect(isOk(result)).toBe(true);
			if (!result.ok) return;
			expect(result.value.finalState).toBe(PendingState.Filled);
			expect(result.value.totalFilled.eq(d("100"))).toBe(true);
		});

		it("assigns unique exchangeOrderId for each submission", async () => {
			const executor = new PaperExecutor();
			const r1 = await executor.submit(testIntent());
			const r2 = await executor.submit(testIntent());

			expect(isOk(r1)).toBe(true);
			expect(isOk(r2)).toBe(true);
			if (!r1.ok || !r2.ok) return;
			expect(r1.value.exchangeOrderId).not.toBe(r2.value.exchangeOrderId);
		});

		it("assigns sequential clientOrderIds from counter", async () => {
			const executor = new PaperExecutor();
			const r1 = await executor.submit(testIntent());
			const r2 = await executor.submit(testIntent());
			const r3 = await executor.submit(testIntent());

			expect(isOk(r1) && isOk(r2) && isOk(r3)).toBe(true);
			if (!r1.ok || !r2.ok || !r3.ok) return;

			const id1 = r1.value.clientOrderId as unknown as string;
			const id2 = r2.value.clientOrderId as unknown as string;
			const id3 = r3.value.clientOrderId as unknown as string;

			expect(id1).toBe("paper-1");
			expect(id2).toBe("paper-2");
			expect(id3).toBe("paper-3");
		});

		it("avgFillPrice equals intent price when slippage is zero", async () => {
			const executor = new PaperExecutor({ slippageBps: 0 });
			const result = await executor.submit(testIntent({ price: d("0.72") }));

			expect(isOk(result)).toBe(true);
			if (!result.ok) return;
			expect(result.value.avgFillPrice).not.toBeNull();
			expect(result.value.avgFillPrice?.eq(d("0.72"))).toBe(true);
		});

		it("applies positive slippage for buy orders", async () => {
			const executor = new PaperExecutor({ slippageBps: 50 });
			const intent = testIntent({
				direction: OrderDirection.Buy,
				price: d("0.65"),
			});
			const result = await executor.submit(intent);

			expect(isOk(result)).toBe(true);
			if (!result.ok) return;
			// 50 bps = 0.5% → 0.65 * 1.005 = 0.65325
			expect(result.value.avgFillPrice?.gt(d("0.65"))).toBe(true);
			expect(result.value.avgFillPrice?.eq(d("0.65325"))).toBe(true);
		});

		it("applies negative slippage for sell orders", async () => {
			const executor = new PaperExecutor({ slippageBps: 50 });
			const intent = testIntent({
				direction: OrderDirection.Sell,
				price: d("0.65"),
			});
			const result = await executor.submit(intent);

			expect(isOk(result)).toBe(true);
			if (!result.ok) return;
			// 50 bps = 0.5% → 0.65 * 0.995 = 0.64675
			expect(result.value.avgFillPrice?.lt(d("0.65"))).toBe(true);
			expect(result.value.avgFillPrice?.eq(d("0.64675"))).toBe(true);
		});

		it("partial fill when fillProbability < 1", async () => {
			const executor = new PaperExecutor({ fillProbability: 0.5 });
			const result = await executor.submit(testIntent({ size: d("200") }));

			expect(isOk(result)).toBe(true);
			if (!result.ok) return;
			expect(result.value.finalState).toBe(PendingState.PartiallyFilled);
			expect(result.value.totalFilled.eq(d("100"))).toBe(true);
		});

		it("cancels when fillProbability is 0", async () => {
			const executor = new PaperExecutor({ fillProbability: 0 });
			const result = await executor.submit(testIntent());

			expect(isOk(result)).toBe(true);
			if (!result.ok) return;
			expect(result.value.finalState).toBe(PendingState.Cancelled);
			expect(result.value.totalFilled.isZero()).toBe(true);
			expect(result.value.avgFillPrice).toBeNull();
		});

		it("handles zero-size order as edge case", async () => {
			const executor = new PaperExecutor();
			const result = await executor.submit(testIntent({ size: d("0") }));

			expect(isOk(result)).toBe(true);
			if (!result.ok) return;
			expect(result.value.totalFilled.isZero()).toBe(true);
		});

		it("handles very small fillProbability", async () => {
			const executor = new PaperExecutor({ fillProbability: 0.01 });
			const result = await executor.submit(testIntent({ size: d("1000") }));

			expect(isOk(result)).toBe(true);
			if (!result.ok) return;
			expect(result.value.finalState).toBe(PendingState.PartiallyFilled);
			expect(result.value.totalFilled.eq(d("10"))).toBe(true);
		});

		it("assigns exchangeOrderId even when cancelled", async () => {
			const executor = new PaperExecutor({ fillProbability: 0 });
			const result = await executor.submit(testIntent());

			expect(isOk(result)).toBe(true);
			if (!result.ok) return;
			expect(result.value.exchangeOrderId).not.toBeNull();
		});
	});

	describe("cancel", () => {
		it("returns ok for a tracked (active) order", async () => {
			const executor = new PaperExecutor();
			const submitResult = await executor.submit(testIntent());

			expect(isOk(submitResult)).toBe(true);
			if (!submitResult.ok) return;

			const cancelResult = await executor.cancel(submitResult.value.clientOrderId);
			expect(isOk(cancelResult)).toBe(true);
		});

		it("returns error for unknown order id", async () => {
			const executor = new PaperExecutor();
			const result = await executor.cancel(clientOrderId("nonexistent-123"));

			expect(isErr(result)).toBe(true);
		});

		it("returns error when cancelling same order twice", async () => {
			const executor = new PaperExecutor();
			const submitResult = await executor.submit(testIntent());

			expect(isOk(submitResult)).toBe(true);
			if (!submitResult.ok) return;

			const first = await executor.cancel(submitResult.value.clientOrderId);
			expect(isOk(first)).toBe(true);

			const second = await executor.cancel(submitResult.value.clientOrderId);
			expect(isErr(second)).toBe(true);
		});
	});

	describe("fillHistory", () => {
		it("tracks fill records after submission", async () => {
			const clock = new FakeClock(1000);
			const executor = new PaperExecutor({ clock });
			await executor.submit(testIntent());

			const history = executor.fillHistory();
			expect(history).toHaveLength(1);
			expect(history[0]?.timestampMs).toBe(1000);
			expect(history[0]?.intent.price.eq(d("0.65"))).toBe(true);
		});

		it("tracks multiple submits independently", async () => {
			const executor = new PaperExecutor();
			await executor.submit(testIntent({ price: d("0.50") }));
			await executor.submit(testIntent({ price: d("0.60") }));
			await executor.submit(testIntent({ price: d("0.70") }));

			const history = executor.fillHistory();
			expect(history).toHaveLength(3);
			expect(history[0]?.intent.price.eq(d("0.50"))).toBe(true);
			expect(history[1]?.intent.price.eq(d("0.60"))).toBe(true);
			expect(history[2]?.intent.price.eq(d("0.70"))).toBe(true);
		});

		it("returns defensive copy (not internal reference)", async () => {
			const executor = new PaperExecutor();
			await executor.submit(testIntent());

			const h1 = executor.fillHistory();
			const h2 = executor.fillHistory();
			expect(h1).not.toBe(h2);
			expect(h1).toEqual(h2);
		});

		it("records cancelled orders in fill history", async () => {
			const executor = new PaperExecutor({ fillProbability: 0 });
			await executor.submit(testIntent());

			const history = executor.fillHistory();
			expect(history).toHaveLength(1);
			expect(history[0]?.result.finalState).toBe(PendingState.Cancelled);
		});

		it("bounds fill history when maxFillHistory is exceeded", async () => {
			const executor = new PaperExecutor({ maxFillHistory: 3 });
			await executor.submit(testIntent({ price: d("0.10") }));
			await executor.submit(testIntent({ price: d("0.20") }));
			await executor.submit(testIntent({ price: d("0.30") }));
			await executor.submit(testIntent({ price: d("0.40") }));
			await executor.submit(testIntent({ price: d("0.50") }));

			const history = executor.fillHistory();
			expect(history).toHaveLength(3);
			expect(history[0]?.intent.price.eq(d("0.30"))).toBe(true);
			expect(history[1]?.intent.price.eq(d("0.40"))).toBe(true);
			expect(history[2]?.intent.price.eq(d("0.50"))).toBe(true);
		});

		it("defaults maxFillHistory to 10000", async () => {
			const executor = new PaperExecutor();
			for (let i = 0; i < 10005; i++) {
				await executor.submit(testIntent({ price: d(String(i)) }));
			}

			const history = executor.fillHistory();
			expect(history).toHaveLength(10000);
			expect(history[0]?.intent.price.eq(d("5"))).toBe(true);
			expect(history[9999]?.intent.price.eq(d("10004"))).toBe(true);
		});
	});

	describe("fillProbability validation (HARD-1)", () => {
		it("rejects fillProbability > 1", () => {
			expect(() => new PaperExecutor({ fillProbability: 1.5 })).toThrow(
				/fillProbability must be in \[0, 1\]/,
			);
		});

		it("rejects negative fillProbability", () => {
			expect(() => new PaperExecutor({ fillProbability: -0.1 })).toThrow(
				/fillProbability must be in \[0, 1\]/,
			);
		});

		it("accepts fillProbability = 0", () => {
			expect(() => new PaperExecutor({ fillProbability: 0 })).not.toThrow();
		});

		it("accepts fillProbability = 1", () => {
			expect(() => new PaperExecutor({ fillProbability: 1 })).not.toThrow();
		});
	});

	describe("clock integration", () => {
		it("uses injected clock for fill timestamps", async () => {
			const clock = new FakeClock(5000);
			const executor = new PaperExecutor({ clock });

			await executor.submit(testIntent());
			clock.advance(1000);
			await executor.submit(testIntent());

			const history = executor.fillHistory();
			expect(history[0]?.timestampMs).toBe(5000);
			expect(history[1]?.timestampMs).toBe(6000);
		});
	});
});
