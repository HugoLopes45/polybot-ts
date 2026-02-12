/**
 * Execution bounded context — interfaces and config.
 *
 * Executor abstracts order submission/cancellation, enabling paper-trading
 * and live implementations behind a single interface.
 */

import type { OrderResult } from "../order/types.js";
import type { TradingError } from "../shared/errors.js";
import type { ClientOrderId } from "../shared/identifiers.js";
import type { Result } from "../shared/result.js";
import type { SdkOrderIntent } from "../signal/types.js";

export interface Executor {
	submit(intent: SdkOrderIntent): Promise<Result<OrderResult, TradingError>>;
	cancel(orderId: ClientOrderId): Promise<Result<void, TradingError>>;
}

export interface RetryConfig {
	readonly maxAttempts: number;
	readonly baseDelayMs: number;
	readonly maxDelayMs: number;
	readonly jitterFactor: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
	maxAttempts: 3,
	baseDelayMs: 100,
	maxDelayMs: 5000,
	jitterFactor: 0.1,
};
