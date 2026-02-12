import { describe, expect, it } from "vitest";
import {
	AuthError,
	ConfigError,
	ErrorCategory,
	InsufficientBalanceError,
	NetworkError,
	OrderRejectedError,
	RateLimitError,
	SystemError,
	TimeoutError,
	TradingError,
	classifyError,
} from "./errors.js";

describe("TradingError hierarchy", () => {
	describe("error categories", () => {
		const cases: Array<[string, TradingError, ErrorCategory]> = [
			["NetworkError", new NetworkError("conn refused"), ErrorCategory.Retryable],
			["TimeoutError", new TimeoutError("timed out"), ErrorCategory.Retryable],
			["RateLimitError", new RateLimitError("429", 1000), ErrorCategory.Retryable],
			["AuthError", new AuthError("invalid key"), ErrorCategory.NonRetryable],
			["OrderRejectedError", new OrderRejectedError("rejected"), ErrorCategory.NonRetryable],
			[
				"InsufficientBalanceError",
				new InsufficientBalanceError("no funds"),
				ErrorCategory.NonRetryable,
			],
			["ConfigError", new ConfigError("bad config"), ErrorCategory.Fatal],
			["SystemError", new SystemError("panic"), ErrorCategory.Fatal],
		];

		it.each(cases)("%s has category %s", (_name, error, expected) => {
			expect(error.category).toBe(expected);
		});
	});

	describe("isRetryable", () => {
		it("retryable errors return true", () => {
			expect(new NetworkError("fail").isRetryable).toBe(true);
			expect(new TimeoutError("fail").isRetryable).toBe(true);
		});

		it("non-retryable errors return false", () => {
			expect(new AuthError("fail").isRetryable).toBe(false);
			expect(new ConfigError("fail").isRetryable).toBe(false);
		});
	});

	describe("error properties", () => {
		it("preserves message, code, and context", () => {
			const e = new OrderRejectedError("bad price", { price: 1.5 });
			expect(e.message).toBe("bad price");
			expect(e.code).toBe("ORDER_REJECTED");
			expect(e.context).toEqual({ price: 1.5 });
		});

		it("RateLimitError carries retryAfterMs", () => {
			const e = new RateLimitError("slow down", 2000);
			expect(e.retryAfterMs).toBe(2000);
		});

		it("is instanceof Error", () => {
			expect(new NetworkError("fail")).toBeInstanceOf(Error);
			expect(new NetworkError("fail")).toBeInstanceOf(TradingError);
		});
	});
});

describe("classifyError", () => {
	it("returns TradingError as-is", () => {
		const original = new AuthError("bad key");
		expect(classifyError(original)).toBe(original);
	});

	it("classifies timeout errors", () => {
		const e = classifyError(new Error("request timed out"));
		expect(e).toBeInstanceOf(TimeoutError);
		expect(e.isRetryable).toBe(true);
	});

	it("classifies connection errors", () => {
		const e = classifyError(new Error("ECONNREFUSED"));
		expect(e).toBeInstanceOf(NetworkError);
	});

	it("classifies rate limit errors", () => {
		const e = classifyError(new Error("429 Too Many Requests"));
		expect(e).toBeInstanceOf(RateLimitError);
	});

	it("classifies unknown errors as SystemError", () => {
		const e = classifyError(new Error("something weird"));
		expect(e).toBeInstanceOf(SystemError);
		expect(e.category).toBe(ErrorCategory.Fatal);
	});

	it("handles non-Error thrown values", () => {
		const e = classifyError("string error");
		expect(e).toBeInstanceOf(SystemError);
		expect(e.message).toBe("string error");
	});
});
