import { describe, expect, it, vi } from "vitest";
import { Decimal } from "../shared/decimal.js";
import {
	clientOrderId,
	conditionId,
	exchangeOrderId,
	marketTokenId,
} from "../shared/identifiers.js";
import { OrderHandleBuilder } from "./order-handle-builder.js";
import { OrderRegistry } from "./order-registry.js";
import { OrderTracker } from "./order-tracker.js";
import type { FillInfo } from "./types.js";
import { OrderSide, PendingState } from "./types.js";

const d = Decimal.from;

function makePendingOrder(id: string, state: PendingState = PendingState.Submitted) {
	return {
		clientOrderId: clientOrderId(id),
		conditionId: conditionId("cond-1"),
		tokenId: marketTokenId("tok-1"),
		side: OrderSide.Buy as const,
		originalSize: d("100"),
		price: d("0.50"),
		submittedAtMs: 1000,
		state,
		exchangeOrderId: null,
	};
}

function makeFillInfo(_orderId: string): FillInfo {
	return {
		filledSize: d("50"),
		fillPrice: d("0.50"),
		remainingSize: d("50"),
		timestampMs: 2000,
		fee: d("0.10"),
		tradeId: "trade-1",
	};
}

describe("OrderTracker", () => {
	it("transitions order to Open on order_opened event", () => {
		const registry = OrderRegistry.create();
		registry.track(makePendingOrder("ord-1", PendingState.Submitted));
		const tracker = new OrderTracker(registry);

		tracker.handleOpened(clientOrderId("ord-1"), exchangeOrderId("ex-123"));

		const order = registry.get(clientOrderId("ord-1"));
		expect(order?.state).toBe(PendingState.Open);
		expect(order?.exchangeOrderId).toBe(exchangeOrderId("ex-123"));
	});

	it("invokes onFill callback on partial fill", () => {
		const registry = OrderRegistry.create();
		registry.track(makePendingOrder("ord-1", PendingState.Open));
		const tracker = new OrderTracker(registry);

		const onFill = vi.fn();
		tracker.registerHandle(
			clientOrderId("ord-1"),
			OrderHandleBuilder.create(clientOrderId("ord-1")).onFill(onFill).build(),
		);

		tracker.handlePartialFill(clientOrderId("ord-1"), makeFillInfo("ord-1"));

		expect(onFill).toHaveBeenCalledTimes(1);
		const fill = onFill.mock.calls[0][0];
		expect(fill.filledSize.toString()).toBe("50");
		expect(fill.remainingSize.toString()).toBe("50");
	});

	it("invokes onComplete callback on full fill", () => {
		const registry = OrderRegistry.create();
		registry.track(makePendingOrder("ord-1", PendingState.Open));
		const tracker = new OrderTracker(registry);

		const onComplete = vi.fn();
		tracker.registerHandle(
			clientOrderId("ord-1"),
			OrderHandleBuilder.create(clientOrderId("ord-1")).onComplete(onComplete).build(),
		);

		tracker.handleFilled(clientOrderId("ord-1"), {
			filledSize: d("100"),
			fillPrice: d("0.50"),
			remainingSize: d("0"),
			timestampMs: 3000,
			fee: d("0.20"),
			tradeId: "trade-2",
		});

		expect(onComplete).toHaveBeenCalledTimes(1);
		const result = onComplete.mock.calls[0][0];
		expect(result.finalState).toBe(PendingState.Filled);
		expect(result.totalFilled.toString()).toBe("100");
		expect(result.avgFillPrice?.toString()).toBe("0.5");
	});

	it("invokes onCancel callback on cancellation", () => {
		const registry = OrderRegistry.create();
		registry.track(makePendingOrder("ord-1", PendingState.Open));
		const tracker = new OrderTracker(registry);

		const onCancel = vi.fn();
		tracker.registerHandle(
			clientOrderId("ord-1"),
			OrderHandleBuilder.create(clientOrderId("ord-1")).onCancel(onCancel).build(),
		);

		tracker.handleCancelled(clientOrderId("ord-1"), "user_requested");

		expect(onCancel).toHaveBeenCalledWith("user_requested");
		expect(registry.get(clientOrderId("ord-1"))?.state).toBe(PendingState.Cancelled);
	});

	it("invokes onCancel callback on expiration", () => {
		const registry = OrderRegistry.create();
		registry.track(makePendingOrder("ord-1", PendingState.Open));
		const tracker = new OrderTracker(registry);

		const onCancel = vi.fn();
		tracker.registerHandle(
			clientOrderId("ord-1"),
			OrderHandleBuilder.create(clientOrderId("ord-1")).onCancel(onCancel).build(),
		);

		tracker.handleExpired(clientOrderId("ord-1"));

		expect(onCancel).toHaveBeenCalledWith("expired");
		expect(registry.get(clientOrderId("ord-1"))?.state).toBe(PendingState.Expired);
	});

	it("supports awaitable completion via waitForOrder", async () => {
		const registry = OrderRegistry.create();
		registry.track(makePendingOrder("ord-1", PendingState.Submitted));
		const tracker = new OrderTracker(registry);

		const promise = tracker.waitForOrder(clientOrderId("ord-1"));

		tracker.handleOpened(clientOrderId("ord-1"), exchangeOrderId("ex-123"));
		tracker.handleFilled(clientOrderId("ord-1"), {
			filledSize: d("100"),
			fillPrice: d("0.50"),
			remainingSize: d("0"),
			timestampMs: 3000,
		});

		const result = await promise;
		expect(result.finalState).toBe(PendingState.Filled);
	});

	it("resolves waitForOrder on cancellation", async () => {
		const registry = OrderRegistry.create();
		registry.track(makePendingOrder("ord-1", PendingState.Open));
		const tracker = new OrderTracker(registry);

		const promise = tracker.waitForOrder(clientOrderId("ord-1"));
		tracker.handleCancelled(clientOrderId("ord-1"), "timeout");

		const result = await promise;
		expect(result.finalState).toBe(PendingState.Cancelled);
	});

	it("handles rejection event", () => {
		const registry = OrderRegistry.create();
		registry.track(makePendingOrder("ord-1", PendingState.Submitted));
		const tracker = new OrderTracker(registry);

		const onCancel = vi.fn();
		tracker.registerHandle(
			clientOrderId("ord-1"),
			OrderHandleBuilder.create(clientOrderId("ord-1")).onCancel(onCancel).build(),
		);

		tracker.handleRejected(clientOrderId("ord-1"), "insufficient_funds");

		expect(onCancel).toHaveBeenCalledWith("rejected: insufficient_funds");
		expect(registry.get(clientOrderId("ord-1"))?.state).toBe(PendingState.Cancelled);
	});

	it("ignores events for unknown orders", () => {
		const registry = OrderRegistry.create();
		const tracker = new OrderTracker(registry);

		expect(() =>
			tracker.handleFilled(clientOrderId("unknown"), {
				filledSize: d("100"),
				fillPrice: d("0.50"),
				remainingSize: d("0"),
				timestampMs: 3000,
			}),
		).not.toThrow();
	});

	it("transitions from Submitted to Open on opened event", () => {
		const registry = OrderRegistry.create();
		registry.track(makePendingOrder("ord-1", PendingState.Submitted));
		const tracker = new OrderTracker(registry);

		tracker.handleOpened(clientOrderId("ord-1"), exchangeOrderId("ex-123"));

		expect(registry.get(clientOrderId("ord-1"))?.state).toBe(PendingState.Open);
	});

	it("allows partial fill transition from Open", () => {
		const registry = OrderRegistry.create();
		registry.track(makePendingOrder("ord-1", PendingState.Open));
		const tracker = new OrderTracker(registry);

		tracker.handlePartialFill(clientOrderId("ord-1"), makeFillInfo("ord-1"));

		expect(registry.get(clientOrderId("ord-1"))?.state).toBe(PendingState.PartiallyFilled);
	});

	it("resolves waitForOrder with timeout error", async () => {
		const clock = { now: () => 0 };
		const registry = OrderRegistry.create(clock);
		registry.track(makePendingOrder("ord-1", PendingState.Open));
		const tracker = new OrderTracker(registry, clock, 100);

		const promise = tracker.waitForOrder(clientOrderId("ord-1"));

		await expect(promise).rejects.toThrow("Order ord-1 timed out after 100ms");
	});

	it("ignores filled event on already-cancelled order", () => {
		const registry = OrderRegistry.create();
		registry.track(makePendingOrder("ord-1", PendingState.Cancelled));
		const tracker = new OrderTracker(registry);

		tracker.handleFilled(clientOrderId("ord-1"), {
			filledSize: d("100"),
			fillPrice: d("0.50"),
			remainingSize: d("0"),
			timestampMs: 3000,
		});

		expect(registry.get(clientOrderId("ord-1"))?.state).toBe(PendingState.Cancelled);
	});

	it("ignores cancelled event on already-filled order", () => {
		const registry = OrderRegistry.create();
		registry.track(makePendingOrder("ord-1", PendingState.Filled));
		const tracker = new OrderTracker(registry);

		tracker.handleCancelled(clientOrderId("ord-1"), "timeout");

		expect(registry.get(clientOrderId("ord-1"))?.state).toBe(PendingState.Filled);
	});

	it("tracks accumulated fills correctly", async () => {
		const registry = OrderRegistry.create();
		registry.track(makePendingOrder("ord-1", PendingState.Open));
		const tracker = new OrderTracker(registry);

		tracker.handlePartialFill(clientOrderId("ord-1"), {
			filledSize: d("30"),
			fillPrice: d("0.50"),
			remainingSize: d("70"),
			timestampMs: 2000,
		});

		tracker.handlePartialFill(clientOrderId("ord-1"), {
			filledSize: d("20"),
			fillPrice: d("0.50"),
			remainingSize: d("50"),
			timestampMs: 2500,
		});

		tracker.handleFilled(clientOrderId("ord-1"), {
			filledSize: d("50"),
			fillPrice: d("0.50"),
			remainingSize: d("0"),
			timestampMs: 3000,
		});

		const order = registry.get(clientOrderId("ord-1"));
		expect(order?.state).toBe(PendingState.Filled);
	});

	it("partial fill reports correct totalFilled in waitForOrder resolution", async () => {
		const registry = OrderRegistry.create();
		registry.track(makePendingOrder("ord-1", PendingState.Open));
		const tracker = new OrderTracker(registry);

		const promise = tracker.waitForOrder(clientOrderId("ord-1"));

		tracker.handlePartialFill(clientOrderId("ord-1"), {
			filledSize: d("30"),
			fillPrice: d("0.50"),
			remainingSize: d("70"),
			timestampMs: 2000,
		});

		tracker.handleCancelled(clientOrderId("ord-1"), "timeout");

		const result = await promise;
		expect(result.finalState).toBe(PendingState.Cancelled);
		expect(result.totalFilled.toString()).toBe("30");
	});

	it("timeout expires order when handle has timeout", async () => {
		vi.useFakeTimers();

		const registry = OrderRegistry.create();
		registry.track(makePendingOrder("ord-1", PendingState.Open));
		const tracker = new OrderTracker(registry);

		const onCancel = vi.fn();
		tracker.registerHandle(
			clientOrderId("ord-1"),
			OrderHandleBuilder.create(clientOrderId("ord-1")).timeout(5000).onCancel(onCancel).build(),
		);

		vi.advanceTimersByTime(5000);

		expect(registry.get(clientOrderId("ord-1"))?.state).toBe(PendingState.Expired);
		expect(onCancel).toHaveBeenCalledWith("expired");

		vi.useRealTimers();
	});

	it("dispose clears all pending", async () => {
		const registry = OrderRegistry.create();
		registry.track(makePendingOrder("ord-1", PendingState.Open));
		registry.track(makePendingOrder("ord-2", PendingState.Open));
		const tracker = new OrderTracker(registry);

		const promise1 = tracker.waitForOrder(clientOrderId("ord-1"));
		const promise2 = tracker.waitForOrder(clientOrderId("ord-2"));

		tracker.dispose();

		await expect(promise1).rejects.toThrow("OrderTracker disposed");
		await expect(promise2).rejects.toThrow("OrderTracker disposed");
	});

	it("dispose clears completion timeoutIds (no leaked timers)", async () => {
		vi.useFakeTimers();

		const registry = OrderRegistry.create();
		registry.track(makePendingOrder("ord-1", PendingState.Open));
		const tracker = new OrderTracker(registry, { now: () => 0 }, 5000);

		const promise = tracker.waitForOrder(clientOrderId("ord-1"));

		tracker.dispose();

		await expect(promise).rejects.toThrow("OrderTracker disposed");

		// Advance past the timeout — should NOT cause unhandled errors
		vi.advanceTimersByTime(10000);

		vi.useRealTimers();
	});

	it("user callback throw does not prevent completeTerminal", () => {
		const registry = OrderRegistry.create();
		registry.track(makePendingOrder("ord-1", PendingState.Open));
		const tracker = new OrderTracker(registry);

		const onFill = vi.fn(() => {
			throw new Error("user callback error");
		});
		const onComplete = vi.fn();
		tracker.registerHandle(
			clientOrderId("ord-1"),
			OrderHandleBuilder.create(clientOrderId("ord-1"))
				.onFill(onFill)
				.onComplete(onComplete)
				.build(),
		);

		tracker.handleFilled(clientOrderId("ord-1"), {
			filledSize: d("100"),
			fillPrice: d("0.50"),
			remainingSize: d("0"),
			timestampMs: 3000,
			fee: d("0.20"),
			tradeId: "trade-2",
		});

		// onFill threw, but onComplete should still be called
		expect(onFill).toHaveBeenCalled();
		expect(onComplete).toHaveBeenCalled();
	});

	it("user onComplete throw does not prevent resolveIfPending", async () => {
		const registry = OrderRegistry.create();
		registry.track(makePendingOrder("ord-1", PendingState.Open));
		const tracker = new OrderTracker(registry);

		const onComplete = vi.fn(() => {
			throw new Error("user onComplete error");
		});
		tracker.registerHandle(
			clientOrderId("ord-1"),
			OrderHandleBuilder.create(clientOrderId("ord-1")).onComplete(onComplete).build(),
		);

		const promise = tracker.waitForOrder(clientOrderId("ord-1"));

		tracker.handleFilled(clientOrderId("ord-1"), {
			filledSize: d("100"),
			fillPrice: d("0.50"),
			remainingSize: d("0"),
			timestampMs: 3000,
		});

		// Despite onComplete throwing, the promise should still resolve
		const result = await promise;
		expect(result.finalState).toBe(PendingState.Filled);
	});
});
