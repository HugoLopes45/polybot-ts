/**
 * OrderRegistry — tracks pending orders with dedup and TTL cleanup.
 *
 * Maintains in-memory state of all pending orders, indexed by client order ID
 * and by market (conditionId). Supports TTL-based cleanup of terminal orders.
 */

import type { ClientOrderId, ConditionId, ExchangeOrderId } from "../shared/identifiers.js";
import { type Clock, SystemClock } from "../shared/time.js";
import { isTerminal } from "./pending-state-machine.js";
import type { PendingOrder, PendingState } from "./types.js";

/**
 * In-memory registry for tracking pending orders.
 * Provides deduplication, market-based queries, and TTL cleanup.
 */
export class OrderRegistry {
	private readonly orders: Map<string, PendingOrder>;
	private readonly byMarketIndex: Map<string, string[]>;
	private readonly terminalAtMs: Map<string, number>;
	private readonly clock: Clock;

	private constructor(clock: Clock) {
		this.orders = new Map();
		this.byMarketIndex = new Map();
		this.terminalAtMs = new Map();
		this.clock = clock;
	}

	/**
	 * Creates a new OrderRegistry instance.
	 * @param clock - Optional clock for time-based operations (defaults to SystemClock)
	 */
	static create(clock?: Clock): OrderRegistry {
		return new OrderRegistry(clock ?? SystemClock);
	}

	/**
	 * Registers a new pending order in the registry.
	 * @param order - The pending order to track
	 * @throws Error if the order is already being tracked
	 */
	track(order: PendingOrder): void {
		const key = order.clientOrderId as string;
		if (this.orders.has(key)) {
			throw new Error(`Order ${key} already tracked`);
		}
		this.orders.set(key, order);

		const marketKey = order.conditionId as string;
		const existing = this.byMarketIndex.get(marketKey) ?? [];
		this.byMarketIndex.set(marketKey, [...existing, key]);
	}

	/**
	 * Retrieves a pending order by client order ID.
	 * @param clientOrderId - The client order ID to look up
	 * @returns The pending order if found, null otherwise
	 */
	get(clientOrderId: ClientOrderId): PendingOrder | null {
		return this.orders.get(clientOrderId as string) ?? null;
	}

	/**
	 * Updates the state of a tracked order.
	 * @param clientOrderId - The client order ID to update
	 * @param newState - The new pending state
	 */
	updateState(clientOrderId: ClientOrderId, newState: PendingState): void {
		const key = clientOrderId as string;
		const order = this.orders.get(key);
		if (!order) return;

		const updated: PendingOrder = { ...order, state: newState };
		this.orders.set(key, updated);

		if (isTerminal(newState)) {
			this.terminalAtMs.set(key, this.clock.now());
		}
	}

	/**
	 * Updates the exchange order ID for a tracked order.
	 * @param clientOrderId - The client order ID to update
	 * @param exchangeOrderId - The new exchange order ID
	 */
	updateExchangeOrderId(clientOrderId: ClientOrderId, exchangeOrderId: ExchangeOrderId): void {
		const key = clientOrderId as string;
		const order = this.orders.get(key);
		if (!order) return;

		const updated: PendingOrder = { ...order, exchangeOrderId };
		this.orders.set(key, updated);
	}

	/**
	 * Retrieves all pending orders for a specific market.
	 * @param conditionId - The market condition ID
	 * @returns Array of pending orders for the market
	 */
	byMarket(conditionId: ConditionId): readonly PendingOrder[] {
		const keys = this.byMarketIndex.get(conditionId as string) ?? [];
		return keys.map((k) => this.orders.get(k)).filter((o): o is PendingOrder => o !== undefined);
	}

	/**
	 * Returns the count of active (non-terminal) orders.
	 */
	activeCount(): number {
		let count = 0;
		for (const order of this.orders.values()) {
			if (!isTerminal(order.state)) count++;
		}
		return count;
	}

	/**
	 * Removes terminal orders older than the specified TTL.
	 * @param ttlMs - Time-to-live in milliseconds for terminal orders
	 * @returns Number of orders cleaned up
	 */
	cleanup(ttlMs: number): number {
		const now = this.clock.now();
		let cleaned = 0;

		for (const [key, terminalAt] of this.terminalAtMs.entries()) {
			if (now - terminalAt >= ttlMs) {
				this.orders.delete(key);
				this.terminalAtMs.delete(key);

				for (const [marketKey, keys] of this.byMarketIndex.entries()) {
					const filtered = keys.filter((k) => k !== key);
					if (filtered.length === 0) {
						this.byMarketIndex.delete(marketKey);
					} else {
						this.byMarketIndex.set(marketKey, filtered);
					}
				}

				cleaned++;
			}
		}
		return cleaned;
	}
}
