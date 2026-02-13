import type { UserFill, UserOrderStatus, WsMessage } from "./types.js";

/**
 * Callbacks for user-specific WebSocket events.
 *
 * @example
 * ```ts
 * const feed = new UserFeed({
 *   onFill: (fill) => console.log("Filled:", fill.filledSize),
 *   onOrderStatus: (status) => console.log("Status:", status.status),
 * });
 * ```
 */
export interface UserFeedConfig {
	readonly onFill?: (fill: UserFill) => void;
	readonly onOrderStatus?: (status: UserOrderStatus) => void;
}

/**
 * Routes user-specific WebSocket messages to registered callbacks.
 *
 * Non-user messages (BookUpdate, Heartbeat) are silently ignored.
 */
export class UserFeed {
	private readonly config: UserFeedConfig;

	constructor(config: UserFeedConfig) {
		this.config = config;
	}

	/**
	 * Routes incoming WebSocket messages to the appropriate callbacks.
	 * @param messages - Array of WebSocket messages to process
	 */
	processMessages(messages: readonly WsMessage[]): void {
		for (const msg of messages) {
			if (msg.type === "user_fill") {
				this.config.onFill?.(msg);
			} else if (msg.type === "user_order_status") {
				this.config.onOrderStatus?.(msg);
			}
		}
	}
}
