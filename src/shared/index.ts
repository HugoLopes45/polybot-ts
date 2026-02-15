export {
	type ConditionId,
	type MarketTokenId,
	type ClientOrderId,
	type ExchangeOrderId,
	conditionId,
	marketTokenId,
	clientOrderId,
	exchangeOrderId,
	idToString,
} from "./identifiers.js";

export {
	type Result,
	ok,
	err,
	map,
	mapErr,
	flatMap,
	unwrap,
	unwrapOr,
	isOk,
	isErr,
	tryCatch,
	tryCatchAsync,
} from "./result.js";

export {
	ErrorCategory,
	TradingError,
	NetworkError,
	TimeoutError,
	RateLimitError,
	AuthError,
	OrderRejectedError,
	OrderNotFoundError,
	InsufficientBalanceError,
	ConfigError,
	SystemError,
	classifyError,
	isNetworkError,
	isRateLimitError,
	isAuthError,
	isOrderError,
	isInsufficientBalance,
} from "./errors.js";

export { Decimal } from "./decimal.js";
export { MarketSide, oppositeSide, complementPrice } from "./market-side.js";
export { type Clock, SystemClock, FakeClock, Duration } from "./time.js";
export { type SdkConfig, DEFAULT_SDK_CONFIG } from "./config.js";
