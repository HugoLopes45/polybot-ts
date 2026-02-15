/**
 * TradingError hierarchy — structured error classification.
 *
 * Every error has a category (retryable, non-retryable, fatal) which drives
 * retry logic and circuit breaker behavior at the execution layer.
 */

/** Error severity categories that drive retry and circuit breaker behavior. */
export const ErrorCategory = {
	Retryable: "retryable",
	NonRetryable: "non_retryable",
	Fatal: "fatal",
} as const;

export type ErrorCategory = (typeof ErrorCategory)[keyof typeof ErrorCategory];

/** Options for constructing TradingError subclasses with optional cause chain. */
interface TradingErrorOptions {
	readonly cause?: unknown;
}

/** Base error class for all trading operations, with category-based retry semantics. */
export class TradingError extends Error {
	readonly category: ErrorCategory;
	readonly code: string;
	readonly context: Record<string, unknown>;
	readonly hint: string | undefined;

	constructor(
		message: string,
		code: string,
		category: ErrorCategory,
		context: Record<string, unknown> = {},
		hint?: string,
	) {
		super(message);
		this.name = "TradingError";
		this.category = category;
		this.code = code;
		this.context = context;
		this.hint = hint;
	}

	get isRetryable(): boolean {
		return this.category === ErrorCategory.Retryable;
	}

	toJSON(): Record<string, unknown> {
		return {
			name: this.name,
			message: this.message,
			code: this.code,
			category: this.category,
			...(this.hint !== undefined && { hint: this.hint }),
			retryable: this.isRetryable,
			context: this.context,
		};
	}
}

// ── Specific error types ─────────────────────────────────────────────

/** Retryable error for network connectivity failures. */
export class NetworkError extends TradingError {
	constructor(message: string, context: Record<string, unknown> & TradingErrorOptions = {}) {
		const { cause, ...rest } = context;
		super(message, "NETWORK_ERROR", ErrorCategory.Retryable, rest);
		this.name = "NetworkError";
		if (cause !== undefined) this.cause = cause;
	}
}

/** Retryable error for request timeouts. */
export class TimeoutError extends TradingError {
	constructor(message: string, context: Record<string, unknown> & TradingErrorOptions = {}) {
		const { cause, ...rest } = context;
		super(message, "TIMEOUT_ERROR", ErrorCategory.Retryable, rest);
		this.name = "TimeoutError";
		if (cause !== undefined) this.cause = cause;
	}
}

/** Retryable error for rate-limit (HTTP 429) responses; includes retry-after hint. */
export class RateLimitError extends TradingError {
	readonly retryAfterMs: number;
	constructor(
		message: string,
		retryAfterMs: number,
		context: Record<string, unknown> & TradingErrorOptions = {},
	) {
		const { cause, ...rest } = context;
		super(message, "RATE_LIMIT_ERROR", ErrorCategory.Retryable, rest);
		this.name = "RateLimitError";
		this.retryAfterMs = retryAfterMs;
		if (cause !== undefined) this.cause = cause;
	}

	override toJSON(): Record<string, unknown> {
		return {
			...super.toJSON(),
			retryAfterMs: this.retryAfterMs,
		};
	}
}

/** Non-retryable error for authentication/authorization failures. */
export class AuthError extends TradingError {
	constructor(message: string, context: Record<string, unknown> = {}) {
		super(message, "AUTH_ERROR", ErrorCategory.NonRetryable, context);
		this.name = "AuthError";
	}
}

/** Non-retryable error when the exchange rejects an order. */
export class OrderRejectedError extends TradingError {
	constructor(message: string, context: Record<string, unknown> = {}) {
		super(message, "ORDER_REJECTED", ErrorCategory.NonRetryable, context);
		this.name = "OrderRejectedError";
	}
}

/** Non-retryable error when an order cannot be found in the local tracker. */
export class OrderNotFoundError extends TradingError {
	constructor(message: string, context: Record<string, unknown> = {}) {
		super(message, "ORDER_NOT_FOUND", ErrorCategory.NonRetryable, context);
		this.name = "OrderNotFoundError";
	}
}

/** Non-retryable error when USDC balance is too low for the requested operation. */
export class InsufficientBalanceError extends TradingError {
	constructor(message: string, context: Record<string, unknown> = {}) {
		super(message, "INSUFFICIENT_BALANCE", ErrorCategory.NonRetryable, context);
		this.name = "InsufficientBalanceError";
	}
}

/** Fatal error for invalid or missing configuration. */
export class ConfigError extends TradingError {
	constructor(message: string, context: Record<string, unknown> = {}) {
		super(message, "CONFIG_ERROR", ErrorCategory.Fatal, context);
		this.name = "ConfigError";
	}
}

/** Fatal error for unexpected internal failures. */
export class SystemError extends TradingError {
	constructor(message: string, context: Record<string, unknown> & TradingErrorOptions = {}) {
		const { cause, ...rest } = context;
		super(message, "SYSTEM_ERROR", ErrorCategory.Fatal, rest);
		this.name = "SystemError";
		if (cause !== undefined) this.cause = cause;
	}
}

// ── Classification helper ────────────────────────────────────────────

/** Classify an unknown error into the appropriate TradingError subtype by inspecting the message and error code. */
export function classifyError(error: unknown): TradingError {
	if (error instanceof TradingError) return error;
	if (error instanceof Error) {
		const msg = error.message.toLowerCase();
		const code = (error as NodeJS.ErrnoException).code;
		if (msg.includes("timeout") || msg.includes("timed out") || code === "ETIMEDOUT") {
			return new TimeoutError(error.message, { cause: error });
		}
		if (
			msg.includes("econnrefused") ||
			msg.includes("enotfound") ||
			msg.includes("fetch failed") ||
			code === "ECONNREFUSED" ||
			code === "ENOTFOUND" ||
			code === "ECONNRESET"
		) {
			return new NetworkError(error.message, { cause: error });
		}
		if (msg.includes("rate limit") || msg.includes("429")) {
			return new RateLimitError(error.message, 1000, { cause: error });
		}
		return new SystemError(error.message, { cause: error });
	}
	return new SystemError(String(error), { cause: error });
}

// ── Type guards ──────────────────────────────────────────────────────

/** Type guard for NetworkError. */
export function isNetworkError(e: unknown): e is NetworkError {
	return e instanceof NetworkError;
}

/** Type guard for RateLimitError. */
export function isRateLimitError(e: unknown): e is RateLimitError {
	return e instanceof RateLimitError;
}

/** Type guard for AuthError. */
export function isAuthError(e: unknown): e is AuthError {
	return e instanceof AuthError;
}

/** Type guard for OrderRejectedError. */
export function isOrderError(e: unknown): e is OrderRejectedError {
	return e instanceof OrderRejectedError;
}

/** Type guard for InsufficientBalanceError. */
export function isInsufficientBalance(e: unknown): e is InsufficientBalanceError {
	return e instanceof InsufficientBalanceError;
}

/** Type guard for ConfigError. */
export function isConfigError(e: unknown): e is ConfigError {
	return e instanceof ConfigError;
}

/** Type guard for SystemError. */
export function isSystemError(e: unknown): e is SystemError {
	return e instanceof SystemError;
}

/** Type guard for TimeoutError. */
export function isTimeoutError(e: unknown): e is TimeoutError {
	return e instanceof TimeoutError;
}

/** Type guard for OrderNotFoundError. */
export function isOrderNotFoundError(e: unknown): e is OrderNotFoundError {
	return e instanceof OrderNotFoundError;
}
