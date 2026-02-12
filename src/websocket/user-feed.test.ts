import { describe, expect, it, vi } from "vitest";
import type { ExchangeOrderId } from "../shared/identifiers.js";
import { conditionId, exchangeOrderId } from "../shared/identifiers.js";
import type { UserFill, UserOrderStatus, WsMessage } from "./types.js";
import { UserFeed } from "./user-feed.js";

function makeFill(orderId: ExchangeOrderId): UserFill {
	return {
		type: "user_fill",
		orderId,
		filledSize: "50",
		fillPrice: "0.65",
		timestampMs: 1000,
	};
}

function makeOrderStatus(orderId: ExchangeOrderId): UserOrderStatus {
	return {
		type: "user_order_status",
		orderId,
		status: "filled",
		timestampMs: 1001,
	};
}

describe("UserFeed", () => {
	it("calls onFill callback for UserFill messages", () => {
		const onFill = vi.fn();
		const feed = new UserFeed({ onFill });
		const fill = makeFill(exchangeOrderId("ord-1"));

		feed.processMessages([fill]);

		expect(onFill).toHaveBeenCalledTimes(1);
		expect(onFill).toHaveBeenCalledWith(fill);
	});

	it("calls onOrderStatus callback for UserOrderStatus messages", () => {
		const onOrderStatus = vi.fn();
		const feed = new UserFeed({ onOrderStatus });
		const status = makeOrderStatus(exchangeOrderId("ord-2"));

		feed.processMessages([status]);

		expect(onOrderStatus).toHaveBeenCalledTimes(1);
		expect(onOrderStatus).toHaveBeenCalledWith(status);
	});

	it("ignores non-user messages", () => {
		const onFill = vi.fn();
		const onOrderStatus = vi.fn();
		const feed = new UserFeed({ onFill, onOrderStatus });
		const messages: WsMessage[] = [
			{ type: "heartbeat", timestampMs: 1000 },
			{
				type: "book_update",
				conditionId: conditionId("cond-1"),
				bids: [],
				asks: [],
				timestampMs: 1000,
			},
		];

		feed.processMessages(messages);

		expect(onFill).not.toHaveBeenCalled();
		expect(onOrderStatus).not.toHaveBeenCalled();
	});

	it("emits events with correct field mapping", () => {
		const onFill = vi.fn();
		const onOrderStatus = vi.fn();
		const feed = new UserFeed({ onFill, onOrderStatus });
		const oid = exchangeOrderId("ord-3");

		feed.processMessages([makeFill(oid), makeOrderStatus(oid)]);

		const fill = onFill.mock.calls[0]?.[0] as UserFill;
		expect(fill.orderId).toBe(oid);
		expect(fill.filledSize).toBe("50");
		expect(fill.fillPrice).toBe("0.65");
		expect(fill.timestampMs).toBe(1000);

		const status = onOrderStatus.mock.calls[0]?.[0] as UserOrderStatus;
		expect(status.orderId).toBe(oid);
		expect(status.status).toBe("filled");
		expect(status.timestampMs).toBe(1001);
	});
});
