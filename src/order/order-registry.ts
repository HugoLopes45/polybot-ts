/**
 * OrderRegistry — tracks pending orders with dedup and TTL cleanup.
 */

import type { ClientOrderId, ConditionId } from "../shared/identifiers.js";
import { type Clock, SystemClock } from "../shared/time.js";
import { isTerminal } from "./pending-state-machine.js";
import type { PendingOrder, PendingState } from "./types.js";

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

	static create(clock?: Clock): OrderRegistry {
		return new OrderRegistry(clock ?? SystemClock);
	}

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

	get(clientOrderId: ClientOrderId): PendingOrder | null {
		return this.orders.get(clientOrderId as string) ?? null;
	}

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

	byMarket(conditionId: ConditionId): readonly PendingOrder[] {
		const keys = this.byMarketIndex.get(conditionId as string) ?? [];
		return keys.map((k) => this.orders.get(k)).filter((o): o is PendingOrder => o !== undefined);
	}

	activeCount(): number {
		let count = 0;
		for (const order of this.orders.values()) {
			if (!isTerminal(order.state)) count++;
		}
		return count;
	}

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
