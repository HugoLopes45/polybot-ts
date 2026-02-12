/**
 * TradingError hierarchy — structured error classification.
 *
 * Every error has a category (retryable, non-retryable, fatal) which drives
 * retry logic and circuit breaker behavior at the execution layer.
 */

export const ErrorCategory = {
	Retryable: "retryable",
	NonRetryable: "non_retryable",
	Fatal: "fatal",
} as const;

export type ErrorCategory = (typeof ErrorCategory)[keyof typeof ErrorCategory];

export class TradingError extends Error {
	readonly category: ErrorCategory;
	readonly code: string;
	readonly context: Record<string, unknown>;

	constructor(
		message: string,
		code: string,
		category: ErrorCategory,
		context: Record<string, unknown> = {},
	) {
		super(message);
		this.name = "TradingError";
		this.category = category;
		this.code = code;
		this.context = context;
	}

	get isRetryable(): boolean {
		return this.category === ErrorCategory.Retryable;
	}
}

// ── Specific error types ─────────────────────────────────────────────

export class NetworkError extends TradingError {
	constructor(message: string, context: Record<string, unknown> = {}) {
		super(message, "NETWORK_ERROR", ErrorCategory.Retryable, context);
		this.name = "NetworkError";
	}
}

export class TimeoutError extends TradingError {
	constructor(message: string, context: Record<string, unknown> = {}) {
		super(message, "TIMEOUT_ERROR", ErrorCategory.Retryable, context);
		this.name = "TimeoutError";
	}
}

export class RateLimitError extends TradingError {
	readonly retryAfterMs: number;
	constructor(message: string, retryAfterMs: number, context: Record<string, unknown> = {}) {
		super(message, "RATE_LIMIT_ERROR", ErrorCategory.Retryable, context);
		this.name = "RateLimitError";
		this.retryAfterMs = retryAfterMs;
	}
}

export class AuthError extends TradingError {
	constructor(message: string, context: Record<string, unknown> = {}) {
		super(message, "AUTH_ERROR", ErrorCategory.NonRetryable, context);
		this.name = "AuthError";
	}
}

export class OrderRejectedError extends TradingError {
	constructor(message: string, context: Record<string, unknown> = {}) {
		super(message, "ORDER_REJECTED", ErrorCategory.NonRetryable, context);
		this.name = "OrderRejectedError";
	}
}

export class InsufficientBalanceError extends TradingError {
	constructor(message: string, context: Record<string, unknown> = {}) {
		super(message, "INSUFFICIENT_BALANCE", ErrorCategory.NonRetryable, context);
		this.name = "InsufficientBalanceError";
	}
}

export class ConfigError extends TradingError {
	constructor(message: string, context: Record<string, unknown> = {}) {
		super(message, "CONFIG_ERROR", ErrorCategory.Fatal, context);
		this.name = "ConfigError";
	}
}

export class SystemError extends TradingError {
	constructor(message: string, context: Record<string, unknown> = {}) {
		super(message, "SYSTEM_ERROR", ErrorCategory.Fatal, context);
		this.name = "SystemError";
	}
}

// ── Classification helper ────────────────────────────────────────────

export function classifyError(error: unknown): TradingError {
	if (error instanceof TradingError) return error;
	if (error instanceof Error) {
		const msg = error.message.toLowerCase();
		if (msg.includes("timeout") || msg.includes("timed out")) {
			return new TimeoutError(error.message);
		}
		if (msg.includes("econnrefused") || msg.includes("enotfound") || msg.includes("fetch")) {
			return new NetworkError(error.message);
		}
		if (msg.includes("rate limit") || msg.includes("429")) {
			return new RateLimitError(error.message, 1000);
		}
		return new SystemError(error.message);
	}
	return new SystemError(String(error));
}
