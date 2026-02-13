import { describe, expect, it, vi } from "vitest";
import { WatchdogStatus } from "../lifecycle/types.js";
import {
	clientOrderId,
	conditionId,
	exchangeOrderId,
	marketTokenId,
} from "../shared/identifiers.js";
import { MarketSide } from "../shared/market-side.js";
import type { DomainEvent } from "./domain-events.js";
import { EventDispatcher } from "./event-dispatcher.js";
import type { SdkEvent } from "./sdk-events.js";

const sampleOrderPlaced: SdkEvent = {
	type: "order_placed",
	timestamp: 1000,
	clientOrderId: clientOrderId("ord-1"),
	conditionId: conditionId("cond-1"),
	tokenId: marketTokenId("tok-1"),
	side: MarketSide.Yes,
	price: 0.65,
	size: 100,
};

const sampleFill: SdkEvent = {
	type: "fill_received",
	timestamp: 1001,
	clientOrderId: clientOrderId("ord-1"),
	exchangeOrderId: exchangeOrderId("exch-1"),
	price: 0.65,
	filledSize: 50,
	remainingSize: 50,
	fee: 0.01,
};

const sampleRiskBreach: DomainEvent = {
	type: "risk_limit_breached",
	timestamp: 1002,
	guardName: "max_exposure",
	reason: "Exposure exceeds 80%",
	currentValue: 85,
	threshold: 80,
};

const sampleFeedDegraded: DomainEvent = {
	type: "feed_degraded",
	timestamp: 1003,
	status: WatchdogStatus.Degraded,
	silenceMs: 15000,
};

describe("EventDispatcher", () => {
	describe("SDK events", () => {
		it("dispatches to typed handler", () => {
			const dispatcher = new EventDispatcher();
			const handler = vi.fn();

			dispatcher.onSdk("order_placed", handler);
			dispatcher.emitSdk(sampleOrderPlaced);

			expect(handler).toHaveBeenCalledTimes(1);
			expect(handler).toHaveBeenCalledWith(sampleOrderPlaced);
		});

		it("does not dispatch to non-matching handler", () => {
			const dispatcher = new EventDispatcher();
			const handler = vi.fn();

			dispatcher.onSdk("fill_received", handler);
			dispatcher.emitSdk(sampleOrderPlaced);

			expect(handler).not.toHaveBeenCalled();
		});

		it("wildcard handler receives all events", () => {
			const dispatcher = new EventDispatcher();
			const handler = vi.fn();

			dispatcher.onSdk("*", handler);
			dispatcher.emitSdk(sampleOrderPlaced);
			dispatcher.emitSdk(sampleFill);

			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("unsubscribe stops delivery", () => {
			const dispatcher = new EventDispatcher();
			const handler = vi.fn();

			const unsub = dispatcher.onSdk("order_placed", handler);
			dispatcher.emitSdk(sampleOrderPlaced);
			expect(handler).toHaveBeenCalledTimes(1);

			unsub();
			dispatcher.emitSdk(sampleOrderPlaced);
			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("multiple handlers called in order", () => {
			const dispatcher = new EventDispatcher();
			const order: number[] = [];

			dispatcher.onSdk("order_placed", () => order.push(1));
			dispatcher.onSdk("order_placed", () => order.push(2));
			dispatcher.onSdk("*", () => order.push(3));

			dispatcher.emitSdk(sampleOrderPlaced);
			expect(order).toEqual([1, 2, 3]);
		});
	});

	describe("Domain events", () => {
		it("dispatches to typed handler", () => {
			const dispatcher = new EventDispatcher();
			const handler = vi.fn();

			dispatcher.onDomain("risk_limit_breached", handler);
			dispatcher.emitDomain(sampleRiskBreach);

			expect(handler).toHaveBeenCalledWith(sampleRiskBreach);
		});

		it("wildcard handler receives all domain events", () => {
			const dispatcher = new EventDispatcher();
			const handler = vi.fn();

			dispatcher.onDomain("*", handler);
			dispatcher.emitDomain(sampleRiskBreach);
			dispatcher.emitDomain(sampleFeedDegraded);

			expect(handler).toHaveBeenCalledTimes(2);
		});
	});

	describe("clear", () => {
		it("removes all handlers", () => {
			const dispatcher = new EventDispatcher();
			const sdkHandler = vi.fn();
			const domainHandler = vi.fn();

			dispatcher.onSdk("order_placed", sdkHandler);
			dispatcher.onDomain("risk_limit_breached", domainHandler);

			dispatcher.clear();

			dispatcher.emitSdk(sampleOrderPlaced);
			dispatcher.emitDomain(sampleRiskBreach);

			expect(sdkHandler).not.toHaveBeenCalled();
			expect(domainHandler).not.toHaveBeenCalled();
		});
	});

	describe("handler resilience", () => {
		it("continues dispatching when a handler throws (BUG-4)", () => {
			const dispatcher = new EventDispatcher();
			const secondHandler = vi.fn();

			dispatcher.onSdk("order_placed", () => {
				throw new Error("handler exploded");
			});
			dispatcher.onSdk("order_placed", secondHandler);

			dispatcher.emitSdk(sampleOrderPlaced);
			expect(secondHandler).toHaveBeenCalledTimes(1);
			expect(secondHandler).toHaveBeenCalledWith(sampleOrderPlaced);
		});

		it("handler that unsubscribes itself during dispatch does not corrupt iteration (HARD-1)", () => {
			const dispatcher = new EventDispatcher();
			const calls: string[] = [];

			const unsub = dispatcher.onSdk("order_placed", () => {
				calls.push("self-unsub");
				unsub();
			});
			dispatcher.onSdk("order_placed", () => calls.push("second"));

			dispatcher.emitSdk(sampleOrderPlaced);
			expect(calls).toEqual(["self-unsub", "second"]);
		});

		it("same handler registered twice is called twice (HARD-2)", () => {
			const dispatcher = new EventDispatcher();
			const handler = vi.fn();

			dispatcher.onSdk("order_placed", handler);
			dispatcher.onSdk("order_placed", handler);
			dispatcher.emitSdk(sampleOrderPlaced);

			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("domain handler throw does not kill remaining handlers", () => {
			const dispatcher = new EventDispatcher();
			const secondHandler = vi.fn();

			dispatcher.onDomain("risk_limit_breached", () => {
				throw new Error("boom");
			});
			dispatcher.onDomain("risk_limit_breached", secondHandler);

			dispatcher.emitDomain(sampleRiskBreach);
			expect(secondHandler).toHaveBeenCalledTimes(1);
		});

		it("onHandlerError callback receives thrown error", () => {
			const errorCallback = vi.fn();
			const dispatcher = new EventDispatcher(errorCallback);
			const thrownError = new Error("handler exploded");

			dispatcher.onSdk("order_placed", () => {
				throw thrownError;
			});
			dispatcher.emitSdk(sampleOrderPlaced);

			expect(errorCallback).toHaveBeenCalledTimes(1);
			expect(errorCallback).toHaveBeenCalledWith(thrownError);
		});

		it("throwing error callback does not kill remaining handlers", () => {
			const dispatcher = new EventDispatcher(() => {
				throw new Error("callback itself exploded");
			});
			const secondHandler = vi.fn();

			dispatcher.onSdk("order_placed", () => {
				throw new Error("handler throws");
			});
			dispatcher.onSdk("order_placed", secondHandler);

			dispatcher.emitSdk(sampleOrderPlaced);
			expect(secondHandler).toHaveBeenCalledTimes(1);
		});
	});

	describe("isolation", () => {
		it("SDK and domain events are independent", () => {
			const dispatcher = new EventDispatcher();
			const sdkHandler = vi.fn();
			const domainHandler = vi.fn();

			dispatcher.onSdk("*", sdkHandler);
			dispatcher.onDomain("*", domainHandler);

			dispatcher.emitSdk(sampleOrderPlaced);
			expect(sdkHandler).toHaveBeenCalledTimes(1);
			expect(domainHandler).not.toHaveBeenCalled();

			dispatcher.emitDomain(sampleRiskBreach);
			expect(sdkHandler).toHaveBeenCalledTimes(1);
			expect(domainHandler).toHaveBeenCalledTimes(1);
		});
	});
});
