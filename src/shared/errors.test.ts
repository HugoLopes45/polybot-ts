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
	isAuthError,
	isInsufficientBalance,
	isNetworkError,
	isOrderError,
	isRateLimitError,
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

describe("toJSON", () => {
	it("serializes all fields", () => {
		const e = new NetworkError("conn failed", { host: "api.example.com" });
		const json = e.toJSON();
		expect(json).toEqual({
			name: "NetworkError",
			message: "conn failed",
			code: "NETWORK_ERROR",
			category: ErrorCategory.Retryable,
			retryable: true,
			context: { host: "api.example.com" },
		});
	});

	it("includes hint when provided", () => {
		const e = new TradingError("fail", "TEST", ErrorCategory.Fatal, {}, "Try restarting");
		const json = e.toJSON();
		expect(json).toEqual({
			name: "TradingError",
			message: "fail",
			code: "TEST",
			category: ErrorCategory.Fatal,
			hint: "Try restarting",
			retryable: false,
			context: {},
		});
	});

	it("omits hint when not provided", () => {
		const e = new TradingError("fail", "TEST", ErrorCategory.Fatal);
		const json = e.toJSON();
		expect(json).not.toHaveProperty("hint");
	});

	it("includes retryAfterMs for RateLimitError", () => {
		const e = new RateLimitError("slow down", 5000);
		const json = e.toJSON();
		expect(json).toHaveProperty("retryAfterMs", 5000);
	});
});

describe("hint propagation", () => {
	it("stores hint on instance", () => {
		const e = new TradingError("fail", "TEST", ErrorCategory.Fatal, {}, "Check config");
		expect(e.hint).toBe("Check config");
	});

	it("hint is undefined when not provided", () => {
		const e = new TradingError("fail", "TEST", ErrorCategory.Fatal);
		expect(e.hint).toBeUndefined();
	});
});

describe("type guards", () => {
	it("isNetworkError returns true for NetworkError", () => {
		expect(isNetworkError(new NetworkError("fail"))).toBe(true);
	});

	it("isNetworkError returns false for other errors", () => {
		expect(isNetworkError(new AuthError("fail"))).toBe(false);
		expect(isNetworkError(new Error("fail"))).toBe(false);
		expect(isNetworkError("not an error")).toBe(false);
	});

	it("isRateLimitError returns true for RateLimitError", () => {
		expect(isRateLimitError(new RateLimitError("slow", 1000))).toBe(true);
	});

	it("isRateLimitError returns false for other errors", () => {
		expect(isRateLimitError(new NetworkError("fail"))).toBe(false);
	});

	it("isAuthError returns true for AuthError", () => {
		expect(isAuthError(new AuthError("bad key"))).toBe(true);
	});

	it("isAuthError returns false for other errors", () => {
		expect(isAuthError(new NetworkError("fail"))).toBe(false);
	});

	it("isOrderError returns true for OrderRejectedError", () => {
		expect(isOrderError(new OrderRejectedError("rejected"))).toBe(true);
	});

	it("isOrderError returns false for other errors", () => {
		expect(isOrderError(new AuthError("fail"))).toBe(false);
	});

	it("isInsufficientBalance returns true for InsufficientBalanceError", () => {
		expect(isInsufficientBalance(new InsufficientBalanceError("no funds"))).toBe(true);
	});

	it("isInsufficientBalance returns false for other errors", () => {
		expect(isInsufficientBalance(new AuthError("fail"))).toBe(false);
	});

	it("all guards return false for null", () => {
		expect(isNetworkError(null)).toBe(false);
		expect(isRateLimitError(null)).toBe(false);
		expect(isAuthError(null)).toBe(false);
		expect(isOrderError(null)).toBe(false);
		expect(isInsufficientBalance(null)).toBe(false);
	});

	it("all guards return false for undefined", () => {
		expect(isNetworkError(undefined)).toBe(false);
		expect(isRateLimitError(undefined)).toBe(false);
		expect(isAuthError(undefined)).toBe(false);
		expect(isOrderError(undefined)).toBe(false);
		expect(isInsufficientBalance(undefined)).toBe(false);
	});
});

describe("classifyError edge cases", () => {
	it("classifies number thrown value as SystemError", () => {
		const e = classifyError(42);
		expect(e).toBeInstanceOf(SystemError);
		expect(e.message).toBe("42");
	});

	it("classifies null thrown value as SystemError", () => {
		const e = classifyError(null);
		expect(e).toBeInstanceOf(SystemError);
		expect(e.message).toBe("null");
	});

	it("classifies undefined thrown value as SystemError", () => {
		const e = classifyError(undefined);
		expect(e).toBeInstanceOf(SystemError);
		expect(e.message).toBe("undefined");
	});

	it("classifies fetch error as NetworkError", () => {
		const e = classifyError(new Error("fetch failed"));
		expect(e).toBeInstanceOf(NetworkError);
	});

	it("classifies ENOTFOUND as NetworkError", () => {
		const e = classifyError(new Error("getaddrinfo ENOTFOUND api.example.com"));
		expect(e).toBeInstanceOf(NetworkError);
	});
});
