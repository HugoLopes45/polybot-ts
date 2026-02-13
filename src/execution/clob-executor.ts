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
import type { TradingError } from "../shared/errors.js";
import { clientOrderId, exchangeOrderId } from "../shared/identifiers.js";
import type { ClientOrderId } from "../shared/identifiers.js";
import { type Result, ok } from "../shared/result.js";
import type { SdkOrderIntent } from "../signal/types.js";
import type { Executor } from "./types.js";

export class ClobExecutor implements Executor {
	private readonly clobClient: ClobClient;
	private readonly rateLimiter: TokenBucketRateLimiter;
	private orderCounter = 0;
	private readonly activeOrders = new Map<string, string>();

	constructor(clobClient: ClobClient, rateLimiter: TokenBucketRateLimiter) {
		this.clobClient = clobClient;
		this.rateLimiter = rateLimiter;
	}

	async submit(intent: SdkOrderIntent): Promise<Result<OrderResult, TradingError>> {
		await this.rateLimiter.waitForToken();

		this.orderCounter++;
		const coid = clientOrderId(`clob-${this.orderCounter}`);
		const req = buildClobOrder(intent);

		const result = await this.clobClient.submitOrder(req);
		if (!result.ok) return result;

		const response = result.value;
		const filledSize = Decimal.from(response.filledSize);
		const totalSize = intent.size;
		const finalState = this.mapStatus(response.status, filledSize, totalSize);

		const eoid = exchangeOrderId(response.orderId);
		this.activeOrders.set(coid as string, response.orderId);

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
		const exchangeId = this.activeOrders.get(orderId as string);
		if (exchangeId) {
			return this.clobClient.cancelOrder(exchangeId);
		}
		return this.clobClient.cancelOrder(orderId as string);
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
		return PendingState.Open;
	}
}
