import { describe, expect, it } from "vitest";
import { PendingState } from "../order/types.js";
import { Decimal } from "../shared/decimal.js";
import { FakeClock } from "../shared/time.js";
import { OrderDirection } from "../signal/types.js";
import type { SdkOrderIntent } from "../signal/types.js";
import { PaperExecutor } from "./paper-executor.js";

describe("PaperExecutor — Order Age Expiry", () => {
	const createIntent = (
		price = "0.5",
		size = "10",
		direction = OrderDirection.Buy,
	): SdkOrderIntent => ({
		marketTokenId: "test-market",
		price: Decimal.from(price),
		size: Decimal.from(size),
		direction,
	});

	describe("maxOrderAgeMs = 0 (disabled)", () => {
		it("should never auto-expire orders", async () => {
			const clock = new FakeClock(1000);
			const executor = new PaperExecutor({ maxOrderAgeMs: 0, clock });

			const result1 = await executor.submit(createIntent());
			expect(result1.ok).toBe(true);

			clock.advance(10000);

			const result2 = await executor.submit(createIntent());
			expect(result2.ok).toBe(true);
			expect(executor.activeOrderCount()).toBe(2);
		});
	});

	describe("maxOrderAgeMs > 0", () => {
		it("should auto-cancel order after maxOrderAgeMs", async () => {
			const clock = new FakeClock(1000);
			const executor = new PaperExecutor({ maxOrderAgeMs: 1000, clock });

			const result1 = await executor.submit(createIntent());
			expect(result1.ok).toBe(true);
			expect(executor.activeOrderCount()).toBe(1);

			clock.advance(1001);

			const result2 = await executor.submit(createIntent());
			expect(result2.ok).toBe(true);
			expect(executor.activeOrderCount()).toBe(1);

			const history = executor.fillHistory();
			const expiredRecord = history.find((r) => r.result.finalState === PendingState.Cancelled);
			expect(expiredRecord).toBeDefined();
		});

		it("should not expire orders within age limit", async () => {
			const clock = new FakeClock(1000);
			const executor = new PaperExecutor({ maxOrderAgeMs: 2000, clock });

			const result1 = await executor.submit(createIntent());
			expect(result1.ok).toBe(true);
			expect(executor.activeOrderCount()).toBe(1);

			clock.advance(500);

			const result2 = await executor.submit(createIntent());
			expect(result2.ok).toBe(true);
			expect(executor.activeOrderCount()).toBe(2);
		});

		it("should sweep on submit()", async () => {
			const clock = new FakeClock(1000);
			const executor = new PaperExecutor({ maxOrderAgeMs: 1000, clock });

			await executor.submit(createIntent());
			await executor.submit(createIntent());
			expect(executor.activeOrderCount()).toBe(2);

			clock.advance(1001);

			await executor.submit(createIntent());
			expect(executor.activeOrderCount()).toBe(1);
		});

		it("should add cancelled orders to fill history", async () => {
			const clock = new FakeClock(1000);
			const executor = new PaperExecutor({ maxOrderAgeMs: 500, clock });

			const intent = createIntent();
			await executor.submit(intent);

			clock.advance(501);

			await executor.submit(createIntent());

			const history = executor.fillHistory();
			const cancelledRecords = history.filter(
				(r) => r.result.finalState === PendingState.Cancelled,
			);
			expect(cancelledRecords.length).toBeGreaterThan(0);
		});

		it("should handle multiple expired orders", async () => {
			const clock = new FakeClock(1000);
			const executor = new PaperExecutor({ maxOrderAgeMs: 1000, clock });

			await executor.submit(createIntent());
			await executor.submit(createIntent());
			await executor.submit(createIntent());
			expect(executor.activeOrderCount()).toBe(3);

			clock.advance(1001);

			await executor.submit(createIntent());
			expect(executor.activeOrderCount()).toBe(1);

			const history = executor.fillHistory();
			const cancelledRecords = history.filter(
				(r) => r.result.finalState === PendingState.Cancelled,
			);
			expect(cancelledRecords.length).toBe(3);
		});

		it("should only sweep expired orders, not all orders", async () => {
			const clock = new FakeClock(1000);
			const executor = new PaperExecutor({ maxOrderAgeMs: 1000, clock });

			await executor.submit(createIntent());
			clock.advance(500);
			await executor.submit(createIntent());
			expect(executor.activeOrderCount()).toBe(2);

			clock.advance(600);

			await executor.submit(createIntent());
			expect(executor.activeOrderCount()).toBe(2);
		});
	});

	describe("activeOrderCount", () => {
		it("should reflect current active orders", async () => {
			const clock = new FakeClock(1000);
			const executor = new PaperExecutor({ clock });

			expect(executor.activeOrderCount()).toBe(0);

			await executor.submit(createIntent());
			expect(executor.activeOrderCount()).toBe(1);

			await executor.submit(createIntent());
			expect(executor.activeOrderCount()).toBe(2);
		});

		it("should decrease after manual cancel", async () => {
			const clock = new FakeClock(1000);
			const executor = new PaperExecutor({ clock });

			const result = await executor.submit(createIntent());
			expect(result.ok).toBe(true);
			expect(executor.activeOrderCount()).toBe(1);

			if (result.ok) {
				await executor.cancel(result.value.clientOrderId);
				expect(executor.activeOrderCount()).toBe(0);
			}
		});

		it("should decrease after auto-expiry", async () => {
			const clock = new FakeClock(1000);
			const executor = new PaperExecutor({ maxOrderAgeMs: 500, clock });

			await executor.submit(createIntent());
			expect(executor.activeOrderCount()).toBe(1);

			clock.advance(501);

			await executor.submit(createIntent());
			expect(executor.activeOrderCount()).toBe(1);
		});
	});

	describe("edge cases", () => {
		it("should handle zero fillProbability with expiry", async () => {
			const clock = new FakeClock(1000);
			const executor = new PaperExecutor({ fillProbability: 0, maxOrderAgeMs: 1000, clock });

			const result = await executor.submit(createIntent());
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value.finalState).toBe(PendingState.Cancelled);
			}
			expect(executor.activeOrderCount()).toBe(1);

			clock.advance(1001);

			await executor.submit(createIntent());
			expect(executor.activeOrderCount()).toBe(1);
		});

		it("should preserve order of fill history entries", async () => {
			const clock = new FakeClock(1000);
			const executor = new PaperExecutor({ maxOrderAgeMs: 500, clock });

			await executor.submit(createIntent("0.5", "10", OrderDirection.Buy));
			clock.advance(100);
			await executor.submit(createIntent("0.6", "20", OrderDirection.Sell));

			clock.advance(501);

			await executor.submit(createIntent("0.7", "30", OrderDirection.Buy));

			const history = executor.fillHistory();
			expect(history.length).toBe(5);
			expect(history[0]?.intent.price.eq(Decimal.from(0.5))).toBe(true);
			expect(history[1]?.intent.price.eq(Decimal.from(0.6))).toBe(true);
		});
	});
});
