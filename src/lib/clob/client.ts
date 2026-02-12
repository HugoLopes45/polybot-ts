/**
 * ClobClient — wraps CLOB API deps behind Result error handling.
 */

import { classifyError } from "../../shared/errors.js";
import type { TradingError } from "../../shared/errors.js";
import { type Result, err, ok } from "../../shared/result.js";
import type { ClobClientDeps, ClobOrderRequest, ClobOrderResponse } from "./types.js";

export class ClobClient {
	private readonly deps: ClobClientDeps;

	constructor(deps: ClobClientDeps) {
		this.deps = deps;
	}

	async submitOrder(req: ClobOrderRequest): Promise<Result<ClobOrderResponse, TradingError>> {
		try {
			const response = await this.deps.submitOrder(req);
			return ok(response);
		} catch (error) {
			return err(classifyError(error));
		}
	}

	async cancelOrder(orderId: string): Promise<Result<void, TradingError>> {
		try {
			await this.deps.cancelOrder(orderId);
			return ok(undefined);
		} catch (error) {
			return err(classifyError(error));
		}
	}

	async getOpenOrders(): Promise<Result<ClobOrderResponse[], TradingError>> {
		try {
			const orders = await this.deps.getOpenOrders();
			return ok(orders);
		} catch (error) {
			return err(classifyError(error));
		}
	}
}
