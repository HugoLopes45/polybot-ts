import type { ConditionId, ExchangeOrderId } from "../shared/identifiers.js";

export interface Subscription {
	readonly channel: string;
	readonly assets: readonly string[];
}

export type WsMessage = BookUpdate | UserFill | UserOrderStatus | Heartbeat;

export interface BookUpdate {
	readonly type: "book_update";
	readonly conditionId: ConditionId;
	readonly bids: readonly { readonly price: string; readonly size: string }[];
	readonly asks: readonly { readonly price: string; readonly size: string }[];
	readonly timestampMs: number;
}

export interface UserFill {
	readonly type: "user_fill";
	readonly orderId: ExchangeOrderId;
	readonly filledSize: string;
	readonly fillPrice: string;
	readonly timestampMs: number;
}

export interface UserOrderStatus {
	readonly type: "user_order_status";
	readonly orderId: ExchangeOrderId;
	readonly status: string;
	readonly timestampMs: number;
}

export interface Heartbeat {
	readonly type: "heartbeat";
	readonly timestampMs: number;
}
