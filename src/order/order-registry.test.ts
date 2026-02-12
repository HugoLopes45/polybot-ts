import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { clientOrderId, conditionId, marketTokenId } from "../shared/identifiers.js";
import { OrderRegistry } from "./order-registry.js";
import { OrderSide, PendingState } from "./types.js";

const d = Decimal.from;

function makePendingOrder(id: string) {
	return {
		clientOrderId: clientOrderId(id),
		conditionId: conditionId("cond-1"),
		tokenId: marketTokenId("tok-1"),
		side: OrderSide.Buy as const,
		originalSize: d("100"),
		price: d("0.50"),
		submittedAtMs: 1000,
		state: PendingState.Submitted as const,
		exchangeOrderId: null,
	};
}

describe("OrderRegistry", () => {
	it("tracks a new order", () => {
		const registry = OrderRegistry.create();
		registry.track(makePendingOrder("ord-1"));
		expect(registry.get(clientOrderId("ord-1"))).not.toBeNull();
		expect(registry.activeCount()).toBe(1);
	});

	it("rejects duplicate order IDs", () => {
		const registry = OrderRegistry.create();
		registry.track(makePendingOrder("ord-1"));
		expect(() => registry.track(makePendingOrder("ord-1"))).toThrow();
	});

	it("transitions order state", () => {
		const registry = OrderRegistry.create();
		registry.track(makePendingOrder("ord-1"));
		registry.updateState(clientOrderId("ord-1"), PendingState.Open);
		expect(registry.get(clientOrderId("ord-1"))?.state).toBe(PendingState.Open);
	});

	it("marks order as filled (terminal)", () => {
		const registry = OrderRegistry.create();
		registry.track(makePendingOrder("ord-1"));
		registry.updateState(clientOrderId("ord-1"), PendingState.Filled);
		expect(registry.activeCount()).toBe(0);
	});

	it("finds orders by condition ID", () => {
		const registry = OrderRegistry.create();
		registry.track(makePendingOrder("ord-1"));
		registry.track({
			...makePendingOrder("ord-2"),
			conditionId: conditionId("cond-2"),
		});

		const results = registry.byMarket(conditionId("cond-1"));
		expect(results.length).toBe(1);
	});

	it("cleans up terminal orders beyond TTL", () => {
		const registry = OrderRegistry.create();
		registry.track(makePendingOrder("ord-1"));
		registry.updateState(clientOrderId("ord-1"), PendingState.Filled);

		const cleaned = registry.cleanup(0);
		expect(cleaned).toBe(1);
		expect(registry.get(clientOrderId("ord-1"))).toBeNull();
	});

	it("ignores updateState for unknown order", () => {
		const registry = OrderRegistry.create();
		registry.updateState(clientOrderId("unknown"), PendingState.Filled);
		expect(registry.activeCount()).toBe(0);
	});

	it("cleans up byMarketIndex on cleanup", () => {
		const registry = OrderRegistry.create();
		registry.track(makePendingOrder("ord-1"));
		registry.updateState(clientOrderId("ord-1"), PendingState.Filled);
		registry.cleanup(0);
		expect(registry.byMarket(conditionId("cond-1")).length).toBe(0);
	});

	it("respects TTL during cleanup", () => {
		const clock = { now: () => 1000 };
		const registry = OrderRegistry.create(clock);
		registry.track(makePendingOrder("ord-1"));
		registry.updateState(clientOrderId("ord-1"), PendingState.Filled);

		expect(registry.cleanup(5000)).toBe(0);

		clock.now = () => 7000;
		expect(registry.cleanup(5000)).toBe(1);
	});
});
