/**
 * Retry decorator for Executor — exponential backoff with jitter.
 *
 * Wraps an Executor's submit method with retry logic. Non-retryable errors
 * short-circuit immediately. Cancel passes through without retry.
 */

import type { OrderResult } from "../order/types.js";
import { RateLimitError } from "../shared/errors.js";
import type { TradingError } from "../shared/errors.js";
import type { ClientOrderId } from "../shared/identifiers.js";
import type { Result } from "../shared/result.js";
import type { SdkOrderIntent } from "../signal/types.js";
import { DEFAULT_RETRY_CONFIG } from "./types.js";
import type { Executor, RetryConfig } from "./types.js";

function resolveConfig(overrides?: Partial<RetryConfig>): RetryConfig {
	return {
		maxAttempts: overrides?.maxAttempts ?? DEFAULT_RETRY_CONFIG.maxAttempts,
		baseDelayMs: overrides?.baseDelayMs ?? DEFAULT_RETRY_CONFIG.baseDelayMs,
		maxDelayMs: overrides?.maxDelayMs ?? DEFAULT_RETRY_CONFIG.maxDelayMs,
		jitterFactor: overrides?.jitterFactor ?? DEFAULT_RETRY_CONFIG.jitterFactor,
	};
}

/** @internal Exported for testing only. */
export function computeDelay(attempt: number, config: RetryConfig, error: TradingError): number {
	const exponential = config.baseDelayMs * 2 ** attempt;
	let delay = Math.min(exponential, config.maxDelayMs);

	if (error instanceof RateLimitError) {
		delay = Math.max(delay, error.retryAfterMs);
	}

	const jitter = 1 + (Math.random() - 0.5) * 2 * config.jitterFactor;
	return delay * jitter;
}

function sleep(ms: number): Promise<void> {
	if (ms <= 0) return Promise.resolve();
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

/**
 * Wraps an Executor with retry logic using exponential backoff and jitter.
 *
 * Only retries errors marked as `isRetryable`. Non-retryable errors and
 * cancel operations pass through immediately without retry.
 *
 * @param executor - The underlying executor to wrap
 * @param config - Optional retry configuration overrides
 * @returns A new Executor with retry behavior
 *
 * @example
 * ```ts
 * const retrying = withRetry(executor, { maxAttempts: 3 });
 * const result = await retrying.submit(intent);
 * ```
 */
export function withRetry(executor: Executor, config?: Partial<RetryConfig>): Executor {
	const resolved = resolveConfig(config);

	return {
		async submit(intent: SdkOrderIntent): Promise<Result<OrderResult, TradingError>> {
			let lastResult: Result<OrderResult, TradingError> = await executor.submit(intent);

			if (lastResult.ok || !lastResult.error.isRetryable) {
				return lastResult;
			}

			for (let attempt = 1; attempt < resolved.maxAttempts; attempt++) {
				const delay = computeDelay(attempt - 1, resolved, lastResult.error);
				await sleep(delay);

				lastResult = await executor.submit(intent);

				if (lastResult.ok) return lastResult;
				if (!lastResult.error.isRetryable) return lastResult;
			}

			return lastResult;
		},

		async cancel(orderId: ClientOrderId): Promise<Result<void, TradingError>> {
			return executor.cancel(orderId);
		},
	};
}
