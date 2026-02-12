/**
 * OrderHandle — lifecycle event interface for orders.
 *
 * Consumers attach callbacks for fill/complete/cancel events.
 * The OrderHandleBuilder provides a fluent API.
 */

import type { ClientOrderId } from "../shared/identifiers.js";
import type { FillInfo, OrderResult } from "./types.js";

export type FillHandler = (fill: FillInfo) => void;
export type CompleteHandler = (result: OrderResult) => void;
export type CancelHandler = (reason: string) => void;

export interface OrderHandle {
	readonly clientOrderId: ClientOrderId;
	readonly onFill: FillHandler | null;
	readonly onComplete: CompleteHandler | null;
	readonly onCancel: CancelHandler | null;
	readonly timeoutMs: number | null;
}
