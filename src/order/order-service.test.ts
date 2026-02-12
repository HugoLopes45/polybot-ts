import { describe, expect, it } from "vitest";
import { PaperExecutor } from "../execution/paper-executor.js";
import { Decimal } from "../shared/decimal.js";
import { conditionId, marketTokenId } from "../shared/identifiers.js";
import type { ClientOrderId } from "../shared/identifiers.js";
import { MarketSide } from "../shared/market-side.js";
import { isErr, isOk } from "../shared/result.js";
import { FakeClock } from "../shared/time.js";
import { OrderDirection } from "../signal/types.js";
import type { SdkOrderIntent } from "../signal/types.js";
import { OrderRegistry } from "./order-registry.js";
import { OrderService } from "./order-service.js";
import { PendingState } from "./types.js";
import type { OrderResult } from "./types.js";

function testIntent(overrides?: Partial<SdkOrderIntent>): SdkOrderIntent {
	return {
		conditionId: conditionId("cond-1"),
		tokenId: marketTokenId("tok-1"),
		side: MarketSide.Yes,
		direction: OrderDirection.Buy,
		price: Decimal.from("0.65"),
		size: Decimal.from("100"),
		...overrides,
	};
}

function setup() {
	const clock = new FakeClock(1000);
	const registry = OrderRegistry.create(clock);
	const executor = new PaperExecutor({ clock, fillProbability: 1 });
	const service = new OrderService(registry, clock);
	return { clock, registry, executor, service };
}

describe("OrderService", () => {
	describe("submit", () => {
		it("returns ok with OrderHandle containing clientOrderId", async () => {
			const { service, executor } = setup();
			const result = await service.submit(testIntent(), executor);

			expect(isOk(result)).toBe(true);
			if (result.ok) {
				expect(result.value.clientOrderId).toBeDefined();
				expect(typeof (result.value.clientOrderId as string)).toBe("string");
			}
		});

		it("tracks order in registry after submit", async () => {
			const { service, executor, registry } = setup();
			const result = await service.submit(testIntent(), executor);

			if (result.ok) {
				const tracked = registry.get(result.value.clientOrderId);
				expect(tracked).not.toBeNull();
				expect(tracked?.conditionId).toBe(conditionId("cond-1"));
			}
		});

		it("PendingOrder has correct fields from intent", async () => {
			const { service, executor, registry } = setup();
			const result = await service.submit(testIntent(), executor);

			if (result.ok) {
				const order = registry.get(result.value.clientOrderId);
				expect(order?.tokenId).toBe(marketTokenId("tok-1"));
				expect(order?.side).toBe("buy");
				expect(order?.originalSize.eq(Decimal.from("100"))).toBe(true);
				expect(order?.price.eq(Decimal.from("0.65"))).toBe(true);
			}
		});

		it("generates unique clientOrderIds for multiple submits", async () => {
			const { service, executor } = setup();
			const ids = new Set<string>();

			for (let i = 0; i < 3; i++) {
				const result = await service.submit(testIntent(), executor);
				if (result.ok) {
					ids.add(result.value.clientOrderId as string);
				}
			}

			expect(ids.size).toBe(3);
		});

		it("updates registry state after successful fill", async () => {
			const { service, executor, registry } = setup();
			const result = await service.submit(testIntent(), executor);

			if (result.ok) {
				const order = registry.get(result.value.clientOrderId);
				expect(order?.state).toBe(PendingState.Filled);
			}
		});

		it("updates registry to Cancelled when executor rejects", async () => {
			const { service, registry, clock } = setup();
			const rejector = new PaperExecutor({
				clock,
				fillProbability: 0,
			});
			const result = await service.submit(testIntent(), rejector);

			expect(isOk(result)).toBe(true);
			if (result.ok) {
				const order = registry.get(result.value.clientOrderId);
				expect(order?.state).toBe(PendingState.Cancelled);
			}
		});

		it("fires onComplete handler when provided", async () => {
			const { service, executor } = setup();
			let captured: OrderResult | null = null;

			const result = await service.submit(testIntent(), executor, (b) =>
				b.onComplete((r) => {
					captured = r;
				}),
			);

			expect(isOk(result)).toBe(true);
			expect(captured).not.toBeNull();
			expect(captured?.finalState).toBe(PendingState.Filled);
		});
	});

	describe("cancel", () => {
		it("delegates cancel to executor and updates registry", async () => {
			const { service, registry, clock } = setup();
			let cancelCalled = false;
			const mockExecutor = {
				submit: () => new PaperExecutor({ clock, fillProbability: 1 }).submit(testIntent()),
				cancel: async () => {
					cancelCalled = true;
					return { ok: true as const, value: undefined };
				},
			};

			const submitResult = await service.submit(testIntent(), mockExecutor);

			if (submitResult.ok) {
				const cancelResult = await service.cancel(submitResult.value.clientOrderId, mockExecutor);
				expect(isOk(cancelResult)).toBe(true);
				expect(cancelCalled).toBe(true);
				const order = registry.get(submitResult.value.clientOrderId);
				expect(order?.state).toBe(PendingState.Cancelled);
			}
		});

		it("returns error for unknown orderId", async () => {
			const { service, executor } = setup();
			const fakeId = "nonexistent-id" as ClientOrderId;
			const result = await service.cancel(fakeId, executor);

			expect(isErr(result)).toBe(true);
		});
	});
});
