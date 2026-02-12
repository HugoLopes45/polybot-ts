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
