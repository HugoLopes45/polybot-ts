/**
 * OrderHandle — lifecycle event interface for orders.
 *
 * Consumers attach callbacks for fill/complete/cancel events.
 * The OrderHandleBuilder provides a fluent API.
 */

import type { ClientOrderId } from "../shared/identifiers.js";
import type { FillInfo, OrderResult } from "./types.js";

/** Callback invoked when a partial fill occurs. */
export type FillHandler = (fill: FillInfo) => void;
/** Callback invoked when the order reaches a terminal state. */
export type CompleteHandler = (result: OrderResult) => void;
/** Callback invoked when the order is cancelled. */
export type CancelHandler = (reason: string) => void;

/**
 * Lifecycle event container for an order.
 * @see OrderHandleBuilder
 */
export interface OrderHandle {
	readonly clientOrderId: ClientOrderId;
	readonly onFill: FillHandler | null;
	readonly onComplete: CompleteHandler | null;
	readonly onCancel: CancelHandler | null;
	readonly timeoutMs: number | null;
}
