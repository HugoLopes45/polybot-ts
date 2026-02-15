/**
 * ClobExecutor — Executor backed by the Polymarket CLOB API.
 *
 * Submits orders through the CLOB client with rate limiting.
 * Maps CLOB API responses to the SDK's `OrderResult` model.
 *
 * @example
 * ```ts
 * const executor = new ClobExecutor(clobClient, rateLimiter);
 * const result = await executor.submit(orderIntent);
 * ```
 */

import type { ClobClient } from "../lib/clob/client.js";
import { buildClobOrder } from "../lib/clob/order-builder.js";
import type { TokenBucketRateLimiter } from "../lib/http/rate-limiter.js";
import { PendingState } from "../order/types.js";
import type { OrderResult } from "../order/types.js";
import { Decimal } from "../shared/decimal.js";
import { OrderNotFoundError, TimeoutError } from "../shared/errors.js";
import type { TradingError } from "../shared/errors.js";
import { clientOrderId, exchangeOrderId, idToString } from "../shared/identifiers.js";
import type { ClientOrderId } from "../shared/identifiers.js";
import { type Result, err, ok } from "../shared/result.js";
import type { SdkOrderIntent } from "../signal/types.js";
import type { Executor } from "./types.js";

export class ClobExecutor implements Executor {
	private readonly clobClient: ClobClient;
	private readonly rateLimiter: TokenBucketRateLimiter;
	private readonly requestTimeoutMs: number | undefined;
	private orderCounter = 0;
	private readonly activeOrders = new Map<string, string>();

	constructor(
		clobClient: ClobClient,
		rateLimiter: TokenBucketRateLimiter,
		requestTimeoutMs?: number,
	) {
		this.clobClient = clobClient;
		this.rateLimiter = rateLimiter;
		this.requestTimeoutMs = requestTimeoutMs;
	}

	private async withTimeout<T>(promise: Promise<T>, operationName: string): Promise<T> {
		if (this.requestTimeoutMs === undefined) {
			return promise;
		}

		let timer: ReturnType<typeof setTimeout>;
		const timeoutPromise = new Promise<T>((_, reject) => {
			timer = setTimeout(
				() =>
					reject(
						new TimeoutError(`${operationName} timed out after ${this.requestTimeoutMs}ms`, {
							timeoutMs: this.requestTimeoutMs,
						}),
					),
				this.requestTimeoutMs,
			);
		});
		try {
			return await Promise.race([promise, timeoutPromise]);
		} finally {
			// biome-ignore lint/style/noNonNullAssertion: timer is always assigned before Promise.race
			clearTimeout(timer!);
		}
	}

	async submit(intent: SdkOrderIntent): Promise<Result<OrderResult, TradingError>> {
		await this.rateLimiter.waitForToken();

		this.orderCounter++;
		const coid = clientOrderId(`clob-${this.orderCounter}`);
		const req = buildClobOrder(intent);

		let result: import("../shared/result.js").Result<
			import("../lib/clob/types.js").ClobOrderResponse,
			import("../shared/errors.js").TradingError
		>;
		try {
			result = await this.withTimeout(this.clobClient.submitOrder(req), "submitOrder");
		} catch (e) {
			if (e instanceof TimeoutError) {
				return err(e);
			}
			throw e;
		}
		if (!result.ok) return result;

		const response = result.value;
		const filledSize = Decimal.from(response.filledSize);
		const totalSize = intent.size;
		const finalState = this.mapStatus(response.status, filledSize, totalSize);

		const eoid = exchangeOrderId(response.orderId);
		this.activeOrders.set(idToString(coid), response.orderId);

		if (this.isTerminalState(finalState)) {
			this.activeOrders.delete(idToString(coid));
		}

		const orderResult: OrderResult = {
			clientOrderId: coid,
			exchangeOrderId: eoid,
			finalState,
			totalFilled: filledSize,
			avgFillPrice: response.avgPrice ? Decimal.from(response.avgPrice) : null,
		};

		return ok(orderResult);
	}

	async cancel(orderId: ClientOrderId): Promise<Result<void, TradingError>> {
		const rawId = idToString(orderId);
		const exchangeId = this.activeOrders.get(rawId);
		if (exchangeId) {
			try {
				const result = await this.withTimeout(
					this.clobClient.cancelOrder(exchangeId),
					"cancelOrder",
				);
				if (result.ok) {
					this.activeOrders.delete(rawId);
				}
				return result;
			} catch (e) {
				if (e instanceof TimeoutError) {
					return err(e);
				}
				throw e;
			}
		}
		return err(
			new OrderNotFoundError(`Cannot cancel unknown order "${rawId}": not found in active orders`, {
				orderId: rawId,
			}),
		);
	}

	private mapStatus(status: string, filledSize: Decimal, totalSize: Decimal): PendingState {
		if (status === "MATCHED" || filledSize.gte(totalSize)) {
			return PendingState.Filled;
		}
		if (filledSize.isPositive()) {
			return PendingState.PartiallyFilled;
		}
		if (status === "CANCELLED") {
			return PendingState.Cancelled;
		}
		if (status === "EXPIRED") {
			return PendingState.Expired;
		}
		return PendingState.Open;
	}

	private isTerminalState(state: PendingState): boolean {
		return (
			state === PendingState.Filled ||
			state === PendingState.Cancelled ||
			state === PendingState.Expired
		);
	}

	activeOrderCount(): number {
		return this.activeOrders.size;
	}
}
