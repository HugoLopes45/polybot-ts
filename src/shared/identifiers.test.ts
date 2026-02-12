import { describe, expect, it } from "vitest";
import {
	clientOrderId,
	conditionId,
	exchangeOrderId,
	idToString,
	marketTokenId,
} from "./identifiers.js";

describe("branded identifiers", () => {
	describe("factory functions", () => {
		it("creates valid identifiers from non-empty strings", () => {
			const cid = conditionId("0xabc123");
			const tid = marketTokenId("12345");
			const client = clientOrderId("order-001");
			const exchange = exchangeOrderId("exch-999");

			expect(idToString(cid)).toBe("0xabc123");
			expect(idToString(tid)).toBe("12345");
			expect(idToString(client)).toBe("order-001");
			expect(idToString(exchange)).toBe("exch-999");
		});

		it("throws on empty string", () => {
			expect(() => conditionId("")).toThrow("ConditionId cannot be empty");
			expect(() => marketTokenId("")).toThrow("MarketTokenId cannot be empty");
			expect(() => clientOrderId("")).toThrow("ClientOrderId cannot be empty");
			expect(() => exchangeOrderId("")).toThrow("ExchangeOrderId cannot be empty");
		});
	});

	describe("type safety", () => {
		it("allows comparison between same branded types", () => {
			const a = conditionId("abc");
			const b = conditionId("abc");
			const c = conditionId("xyz");

			expect(a).toBe(b);
			expect(a).not.toBe(c);
		});

		it("preserves underlying string value through idToString", () => {
			const id = conditionId("my-condition");
			expect(idToString(id)).toBe("my-condition");
			expect(typeof idToString(id)).toBe("string");
		});
	});
});
