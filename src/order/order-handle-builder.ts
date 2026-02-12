/**
 * OrderHandleBuilder — fluent, immutable builder for OrderHandle.
 *
 * Provides a chainable API to configure fill, complete, and cancel callbacks
 * before building an immutable OrderHandle instance.
 *
 * @example
 * ```ts
 * const handle = OrderHandleBuilder.create(coid)
 *   .onFill(fill => console.log("Filled:", fill))
 *   .onComplete(result => console.log("Done:", result))
 *   .timeout(30000)
 *   .build();
 * ```
 */

import type { ClientOrderId } from "../shared/identifiers.js";
import type { CancelHandler, CompleteHandler, FillHandler, OrderHandle } from "./order-handle.js";

/**
 * Fluent builder for OrderHandle instances.
 * All builder methods return new builder instances (immutable).
 */
export class OrderHandleBuilder {
	private readonly coid: ClientOrderId;
	private readonly fillHandler: FillHandler | null;
	private readonly completeHandler: CompleteHandler | null;
	private readonly cancelHandler: CancelHandler | null;
	private readonly timeoutValue: number | null;

	private constructor(
		coid: ClientOrderId,
		fillHandler: FillHandler | null,
		completeHandler: CompleteHandler | null,
		cancelHandler: CancelHandler | null,
		timeoutValue: number | null,
	) {
		this.coid = coid;
		this.fillHandler = fillHandler;
		this.completeHandler = completeHandler;
		this.cancelHandler = cancelHandler;
		this.timeoutValue = timeoutValue;
	}

	/**
	 * Creates a new builder for the given client order ID.
	 * @param clientOrderId - The client order ID to associate with the handle
	 */
	static create(clientOrderId: ClientOrderId): OrderHandleBuilder {
		return new OrderHandleBuilder(clientOrderId, null, null, null, null);
	}

	/**
	 * Sets the fill handler callback.
	 * @param handler - Callback invoked on each partial fill
	 * @returns New builder with the fill handler set
	 */
	onFill(handler: FillHandler): OrderHandleBuilder {
		return new OrderHandleBuilder(
			this.coid,
			handler,
			this.completeHandler,
			this.cancelHandler,
			this.timeoutValue,
		);
	}

	/**
	 * Sets the complete handler callback.
	 * @param handler - Callback invoked when order reaches terminal state
	 * @returns New builder with the complete handler set
	 */
	onComplete(handler: CompleteHandler): OrderHandleBuilder {
		return new OrderHandleBuilder(
			this.coid,
			this.fillHandler,
			handler,
			this.cancelHandler,
			this.timeoutValue,
		);
	}

	/**
	 * Sets the cancel handler callback.
	 * @param handler - Callback invoked when order is cancelled
	 * @returns New builder with the cancel handler set
	 */
	onCancel(handler: CancelHandler): OrderHandleBuilder {
		return new OrderHandleBuilder(
			this.coid,
			this.fillHandler,
			this.completeHandler,
			handler,
			this.timeoutValue,
		);
	}

	/**
	 * Sets the timeout for the order handle.
	 * @param ms - Timeout in milliseconds
	 * @returns New builder with the timeout set
	 */
	timeout(ms: number): OrderHandleBuilder {
		return new OrderHandleBuilder(
			this.coid,
			this.fillHandler,
			this.completeHandler,
			this.cancelHandler,
			ms,
		);
	}

	/**
	 * Builds the immutable OrderHandle instance.
	 * @returns Configured OrderHandle with all callbacks and timeout
	 */
	build(): OrderHandle {
		return {
			clientOrderId: this.coid,
			onFill: this.fillHandler,
			onComplete: this.completeHandler,
			onCancel: this.cancelHandler,
			timeoutMs: this.timeoutValue,
		};
	}
}
