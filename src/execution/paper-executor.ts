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
import { clientOrderId, exchangeOrderId } from "../shared/identifiers.js";
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
}

/** Record of a simulated fill, capturing the intent, result, and timestamp. */
export interface FillRecord {
	readonly intent: SdkOrderIntent;
	readonly result: OrderResult;
	readonly timestampMs: number;
}

export class PaperExecutor implements Executor {
	private readonly config: PaperExecutorConfig;
	private orderCounter: number;
	private readonly fills: FillRecord[];
	private readonly activeOrders: Map<string, SdkOrderIntent>;

	constructor(config?: Partial<PaperExecutorConfig>) {
		this.config = {
			fillProbability: config?.fillProbability ?? 1,
			slippageBps: config?.slippageBps ?? 0,
			fillDelayMs: config?.fillDelayMs ?? 0,
			clock: config?.clock ?? SystemClock,
		};
		this.orderCounter = 0;
		this.fills = [];
		this.activeOrders = new Map();
	}

	async submit(intent: SdkOrderIntent): Promise<Result<OrderResult, TradingError>> {
		this.orderCounter++;
		const coid = clientOrderId(`paper-${this.orderCounter}`);
		const eoid = exchangeOrderId(`exch-${this.orderCounter}`);
		const fillRatio = this.config.fillProbability;

		if (fillRatio === 0) {
			const result: OrderResult = {
				clientOrderId: coid,
				exchangeOrderId: eoid,
				finalState: PendingState.Cancelled,
				totalFilled: Decimal.zero(),
				avgFillPrice: null,
			};
			this.fills.push({
				intent,
				result,
				timestampMs: this.config.clock.now(),
			});
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

		this.activeOrders.set(coid as unknown as string, intent);
		this.fills.push({
			intent,
			result,
			timestampMs: this.config.clock.now(),
		});
		return ok(result);
	}

	async cancel(orderId: ClientOrderId): Promise<Result<void, TradingError>> {
		const key = orderId as unknown as string;
		if (this.activeOrders.has(key)) {
			this.activeOrders.delete(key);
			return ok(undefined);
		}
		return err(
			new OrderRejectedError("Unknown order", {
				orderId: orderId as unknown as string,
			}),
		);
	}

	/** Returns the complete history of simulated fills in chronological order. */
	fillHistory(): readonly FillRecord[] {
		return [...this.fills];
	}

	private computeSlippage(direction: OrderDirection): Decimal {
		if (this.config.slippageBps === 0) return Decimal.one();
		const bps = Decimal.from(this.config.slippageBps).div(Decimal.from(10000));
		return direction === OrderDirection.Buy ? Decimal.one().add(bps) : Decimal.one().sub(bps);
	}
}
