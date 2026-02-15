/**
 * CLOB wire-format types — SDK-internal mapping to the Polymarket CLOB API.
 *
 * These types represent the raw request/response shapes exchanged with the
 * CLOB order service. Domain code should never use these directly.
 */

/**
 * Configuration for connecting to a CLOB endpoint.
 */
export interface ClobConfig {
	/** Host URL of the CLOB API (e.g., "https://clob.polymarket.com") */
	readonly host: string;
	/** Chain ID for the network (e.g., 137 for Polygon) */
	readonly chainId: number;
}

/**
 * Request payload for submitting an order to the CLOB.
 */
export interface ClobOrderRequest {
	/** Market token identifier */
	readonly tokenId: string;
	/** Order price (as decimal string, e.g., "0.55") */
	readonly price: string;
	/** Order size (as decimal string, e.g., "10.00") */
	readonly size: string;
	/** Order side - buy or sell */
	readonly side: "BUY" | "SELL";
	/** Order time-in-force type */
	readonly orderType: "GTC" | "IOC" | "FOK" | "GTD";
}

/**
 * Response from the CLOB after order submission or query.
 */
export interface ClobOrderResponse {
	/** Unique identifier for the submitted order */
	readonly orderId: string;
	/** Current order status (e.g., "open", "filled", "cancelled") */
	readonly status: string;
	/** Total size that has been filled */
	readonly filledSize: string;
	/** Average fill price */
	readonly avgPrice: string;
}

/**
 * Dependencies required by the CLOB client.
 * Abstracts the underlying HTTP/WebSocket communication.
 */
export interface ClobProviders {
	/** Submits an order to the CLOB and returns the response */
	submitOrder(req: ClobOrderRequest): Promise<ClobOrderResponse>;
	/** Cancels an existing order by its ID */
	cancelOrder(orderId: string): Promise<void>;
	/** Retrieves all currently open orders */
	getOpenOrders(): Promise<ClobOrderResponse[]>;
}
