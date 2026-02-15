/**
 * OrderTracker — bridges WebSocket events to OrderRegistry state + OrderHandle callbacks.
 *
 * Monitors CLOB order events (opened, filled, partially_filled, cancelled, expired, rejected)
 * and updates OrderRegistry accordingly. Invokes OrderHandle callbacks for lifecycle events.
 * Supports awaitable completion via waitForOrder.
 */

import { Decimal } from "../shared/decimal.js";
import type { ClientOrderId, ExchangeOrderId } from "../shared/identifiers.js";
import type { Clock } from "../shared/time.js";
import { SystemClock } from "../shared/time.js";
import type { OrderHandle } from "./order-handle.js";
import type { OrderRegistry } from "./order-registry.js";
import { canTransitionTo, isTerminal } from "./pending-state-machine.js";
import { PendingState } from "./types.js";
import type { FillInfo, OrderResult, PendingOrder } from "./types.js";

interface PendingCompletion {
	readonly resolve: (result: OrderResult) => void;
	readonly reject: (error: Error) => void;
	readonly timeoutId?: ReturnType<typeof setTimeout>;
}

export class OrderTracker {
	private readonly registry: OrderRegistry;
	private readonly clock: Clock;
	private readonly handles: Map<string, OrderHandle>;
	private readonly pendingCompletions: Map<string, PendingCompletion>;
	private readonly timeoutIds: Map<string, ReturnType<typeof setTimeout>>;
	private readonly filledAmounts: Map<string, Decimal>;
	private readonly defaultTimeoutMs: number;

	constructor(registry: OrderRegistry, clock: Clock = SystemClock, defaultTimeoutMs = 30000) {
		this.registry = registry;
		this.clock = clock;
		this.handles = new Map();
		this.pendingCompletions = new Map();
		this.timeoutIds = new Map();
		this.filledAmounts = new Map();
		this.defaultTimeoutMs = defaultTimeoutMs;
	}

	registerHandle(clientOrderId: ClientOrderId, handle: OrderHandle): void {
		this.handles.set(clientOrderId as string, handle);

		if (handle.timeoutMs !== null) {
			this.setupTimeout(clientOrderId, handle.timeoutMs);
		}
	}

	private setupTimeout(clientOrderId: ClientOrderId, timeoutMs: number): void {
		const key = clientOrderId as string;
		const existingTimeout = this.timeoutIds.get(key);
		if (existingTimeout) {
			clearTimeout(existingTimeout);
		}

		const timeoutId = setTimeout(() => {
			const order = this.registry.get(clientOrderId);
			if (order && !isTerminal(order.state)) {
				this.handleExpired(clientOrderId);
			}
			this.timeoutIds.delete(key);
		}, timeoutMs);

		this.timeoutIds.set(key, timeoutId);
	}

	waitForOrder(clientOrderId: ClientOrderId): Promise<OrderResult> {
		const key = clientOrderId as string;
		const order = this.registry.get(clientOrderId);

		if (!order) {
			return Promise.reject(new Error(`Order ${key} not found`));
		}

		if (isTerminal(order.state)) {
			return Promise.resolve(this.buildOrderResult(order));
		}

		return new Promise((resolve, reject) => {
			const existingTimeout = this.timeoutIds.get(key);
			if (existingTimeout) {
				clearTimeout(existingTimeout);
				this.timeoutIds.delete(key);
			}

			if (this.defaultTimeoutMs > 0) {
				const timeoutId = setTimeout(() => {
					if (this.pendingCompletions.has(key)) {
						this.pendingCompletions.delete(key);
						reject(new Error(`Order ${key} timed out after ${this.defaultTimeoutMs}ms`));
					}
				}, this.defaultTimeoutMs);

				this.pendingCompletions.set(key, { resolve, reject, timeoutId });
			} else {
				this.pendingCompletions.set(key, { resolve, reject });
			}
		});
	}

	handleOpened(clientOrderId: ClientOrderId, exchangeOrderId: ExchangeOrderId): void {
		const order = this.registry.get(clientOrderId);
		if (!order) return;

		if (!canTransitionTo(order.state, PendingState.Open)) return;

		this.registry.updateExchangeOrderId(clientOrderId, exchangeOrderId);
		this.registry.updateState(clientOrderId, PendingState.Open);
	}

	handlePartialFill(clientOrderId: ClientOrderId, event: FillInfo): void {
		const order = this.registry.get(clientOrderId);
		if (!order) return;
		if (!canTransitionTo(order.state, PendingState.PartiallyFilled)) return;

		const key = clientOrderId as string;
		const currentFilled = this.filledAmounts.get(key) ?? Decimal.zero();
		this.filledAmounts.set(key, currentFilled.add(event.filledSize));

		this.registry.updateState(clientOrderId, PendingState.PartiallyFilled);
		this.notifyFill(clientOrderId, event);
	}

	handleFilled(clientOrderId: ClientOrderId, event: FillInfo): void {
		const order = this.registry.get(clientOrderId);
		if (!order) return;
		if (!canTransitionTo(order.state, PendingState.Filled)) return;

		const key = clientOrderId as string;
		this.filledAmounts.set(key, order.originalSize);

		this.registry.updateState(clientOrderId, PendingState.Filled);
		this.notifyFill(clientOrderId, event);
		this.completeTerminal(clientOrderId, event.fillPrice, event.fee, event.tradeId);
	}

	handleCancelled(clientOrderId: ClientOrderId, reason: string): void {
		const order = this.registry.get(clientOrderId);
		if (!order) return;
		if (!canTransitionTo(order.state, PendingState.Cancelled)) return;

		this.registry.updateState(clientOrderId, PendingState.Cancelled);
		this.notifyCancel(clientOrderId, reason);
		this.completeTerminal(clientOrderId);
	}

	handleExpired(clientOrderId: ClientOrderId): void {
		const order = this.registry.get(clientOrderId);
		if (!order) return;
		if (!canTransitionTo(order.state, PendingState.Expired)) return;

		this.registry.updateState(clientOrderId, PendingState.Expired);
		this.notifyCancel(clientOrderId, "expired");
		this.completeTerminal(clientOrderId);
	}

	handleRejected(clientOrderId: ClientOrderId, reason: string): void {
		this.handleCancelled(clientOrderId, `rejected: ${reason}`);
	}

	private safeCallback(fn: () => void): void {
		try {
			fn();
		} catch {
			// User-supplied callback error — do not let it crash the tracker
		}
	}

	private notifyFill(clientOrderId: ClientOrderId, fillInfo: FillInfo): void {
		const handle = this.handles.get(clientOrderId as string);
		if (handle?.onFill) {
			this.safeCallback(() => {
				if (handle.onFill) {
					handle.onFill(fillInfo);
				}
			});
		}
	}

	private notifyCancel(clientOrderId: ClientOrderId, reason: string): void {
		const handle = this.handles.get(clientOrderId as string);
		if (handle?.onCancel) {
			this.safeCallback(() => {
				if (handle.onCancel) {
					handle.onCancel(reason);
				}
			});
		}
	}

	private completeTerminal(
		clientOrderId: ClientOrderId,
		avgFillPrice?: Decimal,
		fee?: Decimal,
		tradeId?: string,
	): void {
		const key = clientOrderId as string;
		const updated = this.registry.get(clientOrderId);
		if (!updated) return;

		const result = this.buildOrderResult(updated, avgFillPrice, fee, tradeId);
		const handle = this.handles.get(key);
		if (handle?.onComplete) {
			this.safeCallback(() => {
				if (handle.onComplete) {
					handle.onComplete(result);
				}
			});
		}
		this.resolveIfPending(key, result);

		const timeoutId = this.timeoutIds.get(key);
		if (timeoutId) {
			clearTimeout(timeoutId);
			this.timeoutIds.delete(key);
		}
	}

	private resolveIfPending(key: string, result: OrderResult): void {
		const completion = this.pendingCompletions.get(key);
		if (completion) {
			if (completion.timeoutId) {
				clearTimeout(completion.timeoutId);
			}
			completion.resolve(result);
			this.pendingCompletions.delete(key);
		}
	}

	private buildOrderResult(
		order: PendingOrder,
		avgFillPrice?: Decimal,
		fee?: Decimal,
		tradeId?: string,
	): OrderResult {
		const key = order.clientOrderId as string;
		const totalFilled = this.filledAmounts.get(key) ?? Decimal.zero();

		return {
			clientOrderId: order.clientOrderId,
			exchangeOrderId: order.exchangeOrderId,
			finalState: order.state,
			totalFilled,
			avgFillPrice: avgFillPrice ?? null,
			fee,
			tradeId,
		};
	}

	dispose(): void {
		for (const [_key, timeoutId] of this.timeoutIds.entries()) {
			clearTimeout(timeoutId);
		}
		this.timeoutIds.clear();

		for (const [_key, completion] of this.pendingCompletions.entries()) {
			if (completion.timeoutId) {
				clearTimeout(completion.timeoutId);
			}
			completion.reject(new Error("OrderTracker disposed"));
		}
		this.pendingCompletions.clear();
	}
}
