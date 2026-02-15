import { describe, expect, it } from "vitest";
import {
	clientOrderId,
	conditionId,
	ethAddress,
	exchangeOrderId,
	idToString,
	marketTokenId,
	unwrap,
} from "./identifiers.js";

describe("branded identifiers", () => {
	describe("unwrap utility", () => {
		it("unwraps ConditionId to raw string", () => {
			const id = conditionId("test-condition");
			expect(unwrap(id)).toBe("test-condition");
		});

		it("unwraps MarketTokenId to raw string", () => {
			const id = marketTokenId("token-123");
			expect(unwrap(id)).toBe("token-123");
		});

		it("unwraps ClientOrderId to raw string", () => {
			const id = clientOrderId("order-456");
			expect(unwrap(id)).toBe("order-456");
		});

		it("unwraps ExchangeOrderId to raw string", () => {
			const id = exchangeOrderId("exchange-789");
			expect(unwrap(id)).toBe("exchange-789");
		});

		it("idToString and unwrap return same value", () => {
			const id = conditionId("same-value");
			expect(unwrap(id)).toBe(idToString(id));
		});
	});

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

		it("throws on whitespace-only strings (BUG-6)", () => {
			expect(() => conditionId("   ")).toThrow("ConditionId cannot be empty");
			expect(() => conditionId("\t")).toThrow("ConditionId cannot be empty");
			expect(() => conditionId("\n")).toThrow("ConditionId cannot be empty");
			expect(() => marketTokenId("  ")).toThrow("MarketTokenId cannot be empty");
		});

		it("trims leading/trailing whitespace from IDs", () => {
			expect(idToString(conditionId(" abc "))).toBe("abc");
			expect(idToString(marketTokenId("\ttok\n"))).toBe("tok");
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

		it("round-trip: idToString(factory(x)) === x (HARD-21)", () => {
			const values = ["abc", "0x123", "with-dashes", "with_underscores", "123"];
			for (const v of values) {
				expect(idToString(conditionId(v))).toBe(v);
				expect(idToString(marketTokenId(v))).toBe(v);
				expect(idToString(clientOrderId(v))).toBe(v);
				expect(idToString(exchangeOrderId(v))).toBe(v);
			}
		});
	});

	describe("ethAddress", () => {
		it("creates valid EthAddress from 0x-prefixed string", () => {
			const addr = ethAddress("0x1234abcdef");
			expect(idToString(addr)).toBe("0x1234abcdef");
		});

		it("throws on non-0x-prefixed string", () => {
			expect(() => ethAddress("not-an-address")).toThrow("must start with");
		});

		it("throws on empty string", () => {
			expect(() => ethAddress("")).toThrow("EthAddress cannot be empty");
		});

		it("trims whitespace before validation", () => {
			const addr = ethAddress("  0xabc123  ");
			expect(idToString(addr)).toBe("0xabc123");
		});
	});
});
