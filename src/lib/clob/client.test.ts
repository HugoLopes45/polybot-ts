/**
 * ClobClient — wraps CLOB API deps with Result error handling.
 */

import { describe, expect, it } from "vitest";
import { NetworkError, SystemError } from "../../shared/errors.js";
import { isErr, isOk } from "../../shared/result.js";
import { ClobClient } from "./client.js";
import type { ClobClientDeps, ClobOrderResponse } from "./types.js";

function stubDeps(overrides: Partial<ClobClientDeps> = {}): ClobClientDeps {
	return {
		submitOrder: overrides.submitOrder ?? (() => Promise.reject(new Error("not implemented"))),
		cancelOrder: overrides.cancelOrder ?? (() => Promise.reject(new Error("not implemented"))),
		getOpenOrders: overrides.getOpenOrders ?? (() => Promise.reject(new Error("not implemented"))),
	};
}

const VALID_RESPONSE: ClobOrderResponse = {
	orderId: "exch-1",
	status: "MATCHED",
	filledSize: "10",
	avgPrice: "0.55",
};

describe("ClobClient", () => {
	describe("submitOrder", () => {
		it("returns ok on successful submission", async () => {
			const deps = stubDeps({
				submitOrder: () => Promise.resolve(VALID_RESPONSE),
			});
			const client = new ClobClient(deps);

			const result = await client.submitOrder({
				tokenId: "tok-1",
				price: "0.55",
				size: "10",
				side: "BUY",
				orderType: "GTC",
			});

			expect(isOk(result)).toBe(true);
			if (result.ok) {
				expect(result.value).toEqual(VALID_RESPONSE);
			}
		});

		it("classifies network errors as NetworkError", async () => {
			const deps = stubDeps({
				submitOrder: () => Promise.reject(new Error("ECONNREFUSED")),
			});
			const client = new ClobClient(deps);

			const result = await client.submitOrder({
				tokenId: "tok-1",
				price: "0.55",
				size: "10",
				side: "BUY",
				orderType: "GTC",
			});

			expect(isErr(result)).toBe(true);
			if (!result.ok) {
				expect(result.error).toBeInstanceOf(NetworkError);
			}
		});

		it("classifies unknown errors as SystemError", async () => {
			const deps = stubDeps({
				submitOrder: () => Promise.reject(new Error("something unexpected")),
			});
			const client = new ClobClient(deps);

			const result = await client.submitOrder({
				tokenId: "tok-1",
				price: "0.55",
				size: "10",
				side: "BUY",
				orderType: "GTC",
			});

			expect(isErr(result)).toBe(true);
			if (!result.ok) {
				expect(result.error).toBeInstanceOf(SystemError);
			}
		});
	});

	describe("cancelOrder", () => {
		it("returns ok on successful cancel", async () => {
			const deps = stubDeps({
				cancelOrder: () => Promise.resolve(),
			});
			const client = new ClobClient(deps);

			const result = await client.cancelOrder("exch-1");

			expect(isOk(result)).toBe(true);
		});

		it("classifies cancel errors", async () => {
			const deps = stubDeps({
				cancelOrder: () => Promise.reject(new Error("ECONNREFUSED")),
			});
			const client = new ClobClient(deps);

			const result = await client.cancelOrder("exch-1");

			expect(isErr(result)).toBe(true);
			if (!result.ok) {
				expect(result.error).toBeInstanceOf(NetworkError);
			}
		});
	});

	describe("getOpenOrders", () => {
		it("returns ok with order list", async () => {
			const orders = [VALID_RESPONSE];
			const deps = stubDeps({
				getOpenOrders: () => Promise.resolve(orders),
			});
			const client = new ClobClient(deps);

			const result = await client.getOpenOrders();

			expect(isOk(result)).toBe(true);
			if (result.ok) {
				expect(result.value).toEqual(orders);
			}
		});

		it("classifies getOpenOrders errors", async () => {
			const deps = stubDeps({
				getOpenOrders: () => Promise.reject(new Error("timeout")),
			});
			const client = new ClobClient(deps);

			const result = await client.getOpenOrders();

			expect(isErr(result)).toBe(true);
		});
	});
});
