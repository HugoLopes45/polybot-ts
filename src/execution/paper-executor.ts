/**
 * PaperExecutor — simulated order execution for backtesting and paper-trading.
 *
 * Fills orders locally with configurable fill probability and slippage.
 * No network calls, fully deterministic when given a FakeClock.
 */

import { PendingState } from "../order/types.js";
import type { OrderResult } from "../order/types.js";
import { Decimal } from "../shared/decimal.js";
import { OrderRejectedError } from "../shared/errors.js";
import type { TradingError } from "../shared/errors.js";
import { clientOrderId, exchangeOrderId, idToString } from "../shared/identifiers.js";
import type { ClientOrderId } from "../shared/identifiers.js";
import type { Result } from "../shared/result.js";
import { err, ok } from "../shared/result.js";
import type { Clock } from "../shared/time.js";
import { SystemClock } from "../shared/time.js";
import type { SdkOrderIntent } from "../signal/types.js";
import { OrderDirection } from "../signal/types.js";
import type { Executor } from "./types.js";

/**
 * Configuration for the paper trading executor.
 *
 * @example
 * ```ts
 * const executor = new PaperExecutor({
 *   fillProbability: 0.95,
 *   slippageBps: 5,
 * });
 * ```
 */
export interface PaperExecutorConfig {
	readonly fillProbability: number;
	readonly slippageBps: number;
	readonly fillDelayMs: number;
	readonly clock: Clock;
	readonly maxFillHistory: number;
	/** Maximum age in ms before an order is auto-cancelled. 0 = disabled. Default: 0 */
	readonly maxOrderAgeMs: number;
}

/** Record of a simulated fill, capturing the intent, result, and timestamp. */
export interface FillRecord {
	readonly intent: SdkOrderIntent;
	readonly result: OrderResult;
	readonly timestampMs: number;
}

interface ActiveOrderEntry {
	readonly intent: SdkOrderIntent;
	readonly submittedAtMs: number;
}

export class PaperExecutor implements Executor {
	private readonly config: PaperExecutorConfig;
	private orderCounter: number;
	private readonly fills: FillRecord[];
	private readonly activeOrders: Map<string, ActiveOrderEntry>;

	constructor(config?: Partial<PaperExecutorConfig>) {
		const fillProbability = config?.fillProbability ?? 1;
		if (fillProbability < 0 || fillProbability > 1) {
			throw new Error(`fillProbability must be in [0, 1], got ${fillProbability}`);
		}
		this.config = {
			fillProbability,
			slippageBps: config?.slippageBps ?? 0,
			fillDelayMs: config?.fillDelayMs ?? 0,
			clock: config?.clock ?? SystemClock,
			maxFillHistory: config?.maxFillHistory ?? 10000,
			maxOrderAgeMs: config?.maxOrderAgeMs ?? 0,
		};
		this.orderCounter = 0;
		this.fills = [];
		this.activeOrders = new Map();
	}

	async submit(intent: SdkOrderIntent): Promise<Result<OrderResult, TradingError>> {
		this.sweepStaleOrders();

		this.orderCounter++;
		const coid = clientOrderId(`paper-${this.orderCounter}`);
		const eoid = exchangeOrderId(`exch-${this.orderCounter}`);
		const fillRatio = this.config.fillProbability;
		const nowMs = this.config.clock.now();

		if (fillRatio === 0) {
			const result: OrderResult = {
				clientOrderId: coid,
				exchangeOrderId: eoid,
				finalState: PendingState.Cancelled,
				totalFilled: Decimal.zero(),
				avgFillPrice: null,
			};
			this.activeOrders.set(idToString(coid), { intent, submittedAtMs: nowMs });
			this.pushFill({ intent, result, timestampMs: nowMs });
			return ok(result);
		}

		const filledSize = intent.size.mul(Decimal.from(fillRatio));
		const slippageMultiplier = this.computeSlippage(intent.direction);
		const fillPrice = intent.price.mul(slippageMultiplier);
		const finalState = fillRatio >= 1 ? PendingState.Filled : PendingState.PartiallyFilled;

		const result: OrderResult = {
			clientOrderId: coid,
			exchangeOrderId: eoid,
			finalState,
			totalFilled: filledSize,
			avgFillPrice: fillPrice,
		};

		this.activeOrders.set(idToString(coid), { intent, submittedAtMs: nowMs });
		this.pushFill({ intent, result, timestampMs: nowMs });
		return ok(result);
	}

	async cancel(orderId: ClientOrderId): Promise<Result<void, TradingError>> {
		const key = idToString(orderId);
		if (this.activeOrders.has(key)) {
			this.activeOrders.delete(key);
			return ok(undefined);
		}
		return err(
			new OrderRejectedError("Unknown order", {
				orderId: idToString(orderId),
			}),
		);
	}

	/** Returns the complete history of simulated fills in chronological order. */
	fillHistory(): readonly FillRecord[] {
		return [...this.fills];
	}

	/** Returns the number of currently active orders. */
	activeOrderCount(): number {
		return this.activeOrders.size;
	}

	private sweepStaleOrders(): void {
		if (this.config.maxOrderAgeMs <= 0) {
			return;
		}

		const nowMs = this.config.clock.now();
		const toExpire: Array<{ key: string; entry: ActiveOrderEntry }> = [];

		for (const [key, entry] of this.activeOrders) {
			if (nowMs - entry.submittedAtMs > this.config.maxOrderAgeMs) {
				toExpire.push({ key, entry });
			}
		}

		for (const { key, entry } of toExpire) {
			this.activeOrders.delete(key);
			const result: OrderResult = {
				clientOrderId: clientOrderId(key),
				exchangeOrderId: exchangeOrderId(`exch-expired-${key}`),
				finalState: PendingState.Cancelled,
				totalFilled: Decimal.zero(),
				avgFillPrice: null,
			};
			this.pushFill({ intent: entry.intent, result, timestampMs: nowMs });
		}
	}

	private computeSlippage(direction: OrderDirection): Decimal {
		if (this.config.slippageBps === 0) return Decimal.one();
		const bps = Decimal.from(this.config.slippageBps).div(Decimal.from(10000));
		return direction === OrderDirection.Buy ? Decimal.one().add(bps) : Decimal.one().sub(bps);
	}

	// O(n) shift at capacity — acceptable at maxFillHistory=10K; consider circular buffer if scaling beyond ~100K
	private pushFill(record: FillRecord): void {
		if (this.fills.length >= this.config.maxFillHistory) {
			this.fills.shift();
		}
		this.fills.push(record);
	}
}
