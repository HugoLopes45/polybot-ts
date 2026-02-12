/**
 * OrderHandleBuilder — fluent, immutable builder for OrderHandle.
 */

import type { ClientOrderId } from "../shared/identifiers.js";
import type { CancelHandler, CompleteHandler, FillHandler, OrderHandle } from "./order-handle.js";

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

	static create(clientOrderId: ClientOrderId): OrderHandleBuilder {
		return new OrderHandleBuilder(clientOrderId, null, null, null, null);
	}

	onFill(handler: FillHandler): OrderHandleBuilder {
		return new OrderHandleBuilder(
			this.coid,
			handler,
			this.completeHandler,
			this.cancelHandler,
			this.timeoutValue,
		);
	}

	onComplete(handler: CompleteHandler): OrderHandleBuilder {
		return new OrderHandleBuilder(
			this.coid,
			this.fillHandler,
			handler,
			this.cancelHandler,
			this.timeoutValue,
		);
	}

	onCancel(handler: CancelHandler): OrderHandleBuilder {
		return new OrderHandleBuilder(
			this.coid,
			this.fillHandler,
			this.completeHandler,
			handler,
			this.timeoutValue,
		);
	}

	timeout(ms: number): OrderHandleBuilder {
		return new OrderHandleBuilder(
			this.coid,
			this.fillHandler,
			this.completeHandler,
			this.cancelHandler,
			ms,
		);
	}

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
