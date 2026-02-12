/**
 * CLOB wire-format types — SDK-internal mapping to the Polymarket CLOB API.
 *
 * These types represent the raw request/response shapes exchanged with the
 * CLOB order service. Domain code should never use these directly.
 */

export interface ClobConfig {
	readonly host: string;
	readonly chainId: number;
}

export interface ClobOrderRequest {
	readonly tokenId: string;
	readonly price: string;
	readonly size: string;
	readonly side: "BUY" | "SELL";
	readonly orderType: "GTC" | "IOC" | "FOK";
}

export interface ClobOrderResponse {
	readonly orderId: string;
	readonly status: string;
	readonly filledSize: string;
	readonly avgPrice: string;
}

export interface ClobClientDeps {
	submitOrder(req: ClobOrderRequest): Promise<ClobOrderResponse>;
	cancelOrder(orderId: string): Promise<void>;
	getOpenOrders(): Promise<ClobOrderResponse[]>;
}
