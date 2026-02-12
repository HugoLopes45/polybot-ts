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

/** Function type to customize the OrderHandleBuilder before building. */
type HandleCustomizer = (builder: OrderHandleBuilder) => OrderHandleBuilder;

/**
 * Orchestrates order submission, tracking, and lifecycle management.
 *
 * Coordinates with an Executor for order submission/cancellation and
 * maintains order state in an OrderRegistry.
 */
export class OrderService {
	private readonly registry: OrderRegistry;
	private readonly clock: Clock;
	private orderCounter = 0;

	/**
	 * Creates a new OrderService.
	 * @param registry - The order registry for tracking pending orders
	 * @param clock - Optional clock for time-based operations (defaults to SystemClock)
	 */
	constructor(registry: OrderRegistry, clock: Clock = SystemClock) {
		this.registry = registry;
		this.clock = clock;
	}

	/**
	 * Submits an order intent through the executor.
	 * @param intent - The order intent to submit
	 * @param executor - The executor to use for submission
	 * @param customize - Optional function to customize the OrderHandleBuilder
	 * @returns Result containing the OrderHandle or a TradingError
	 *
	 * @example
	 * ```ts
	 * const result = await service.submit(intent, executor, builder =>
	 *   builder.onComplete(r => console.log("Done:", r))
	 * );
	 * ```
	 */
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

	/**
	 * Cancels a pending order.
	 * @param orderId - The client order ID to cancel
	 * @param executor - The executor to use for cancellation
	 * @returns Result indicating success or a TradingError
	 */
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
