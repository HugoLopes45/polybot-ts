/**
 * OrderService — orchestrates order submission through an Executor,
 * tracks state in OrderRegistry, and builds OrderHandles with lifecycle callbacks.
 */

import type { Executor } from "../execution/types.js";
import { OrderRejectedError } from "../shared/errors.js";
import type { TradingError } from "../shared/errors.js";
import { clientOrderId } from "../shared/identifiers.js";
import type { ClientOrderId } from "../shared/identifiers.js";
import { type Result, err, ok } from "../shared/result.js";
import type { Clock } from "../shared/time.js";
import { SystemClock } from "../shared/time.js";
import type { SdkOrderIntent } from "../signal/types.js";
import { OrderHandleBuilder } from "./order-handle-builder.js";
import type { OrderHandle } from "./order-handle.js";
import type { OrderRegistry } from "./order-registry.js";
import { PendingState } from "./types.js";
import type { OrderSide, PendingOrder } from "./types.js";

type HandleCustomizer = (builder: OrderHandleBuilder) => OrderHandleBuilder;

export class OrderService {
	private readonly registry: OrderRegistry;
	private readonly clock: Clock;
	private orderCounter = 0;

	constructor(registry: OrderRegistry, clock: Clock = SystemClock) {
		this.registry = registry;
		this.clock = clock;
	}

	async submit(
		intent: SdkOrderIntent,
		executor: Executor,
		customize?: HandleCustomizer,
	): Promise<Result<OrderHandle, TradingError>> {
		this.orderCounter++;
		const coid = clientOrderId(`sdk-${this.orderCounter}`);
		const side: OrderSide = intent.direction === "buy" ? "buy" : "sell";

		const pending: PendingOrder = {
			clientOrderId: coid,
			conditionId: intent.conditionId,
			tokenId: intent.tokenId,
			side,
			originalSize: intent.size,
			price: intent.price,
			submittedAtMs: this.clock.now(),
			state: PendingState.Created,
			exchangeOrderId: null,
		};

		this.registry.track(pending);

		const result = await executor.submit(intent);

		if (!result.ok) {
			this.registry.updateState(coid, PendingState.Cancelled);
			return err(result.error);
		}

		const orderResult = result.value;
		this.registry.updateState(coid, orderResult.finalState);

		let builder = OrderHandleBuilder.create(coid);
		if (customize) {
			builder = customize(builder);
		}
		const handle = builder.build();

		if (handle.onComplete) {
			handle.onComplete(orderResult);
		}

		return ok(handle);
	}

	async cancel(orderId: ClientOrderId, executor: Executor): Promise<Result<void, TradingError>> {
		const tracked = this.registry.get(orderId);
		if (!tracked) {
			return err(
				new OrderRejectedError("Unknown order", {
					orderId: orderId as string,
				}),
			);
		}

		const result = await executor.cancel(orderId);
		if (result.ok) {
			this.registry.updateState(orderId, PendingState.Cancelled);
		}
		return result;
	}
}
