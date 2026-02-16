# Error Handling

Structured error classification with retry semantics, cause chains, and type guards.

## Error Hierarchy

All SDK errors extend `TradingError`, classified into three categories:

```
TradingError (base)
├── Retryable
│   ├── NetworkError       — connectivity failures (ECONNREFUSED, ENOTFOUND)
│   ├── TimeoutError       — request/operation timeouts
│   └── RateLimitError     — HTTP 429, includes retryAfterMs
├── NonRetryable
│   ├── AuthError          — invalid credentials or forbidden (401/403)
│   ├── OrderRejectedError — exchange rejected the order
│   ├── OrderNotFoundError — order not in local tracker
│   └── InsufficientBalanceError — USDC balance too low
└── Fatal
    ├── ConfigError        — invalid or missing configuration
    └── SystemError        — unexpected internal failures
```

## Error Catalog

| Error | Code | Category | When It Occurs |
|-------|------|----------|----------------|
| `NetworkError` | `NETWORK_ERROR` | Retryable | TCP connection failures, DNS resolution errors |
| `TimeoutError` | `TIMEOUT_ERROR` | Retryable | Request or operation exceeds time limit |
| `RateLimitError` | `RATE_LIMIT_ERROR` | Retryable | HTTP 429 from exchange API |
| `AuthError` | `AUTH_ERROR` | NonRetryable | Invalid API key, expired session, forbidden resource |
| `OrderRejectedError` | `ORDER_REJECTED` | NonRetryable | Exchange rejects order (bad params, market closed) |
| `OrderNotFoundError` | `ORDER_NOT_FOUND` | NonRetryable | Cancel/query for unknown order ID |
| `InsufficientBalanceError` | `INSUFFICIENT_BALANCE` | NonRetryable | Not enough USDC for the requested trade |
| `ConfigError` | `CONFIG_ERROR` | Fatal | Missing required config, invalid values |
| `SystemError` | `SYSTEM_ERROR` | Fatal | Unexpected internal error, catch-all |

## Error Properties

Every `TradingError` carries structured context:

```typescript
import { TradingError, NetworkError } from "@polybot/sdk";

const error = new NetworkError("Connection refused", {
  host: "clob.polymarket.com",
  port: 443,
  cause: originalError,
});

error.code;        // "NETWORK_ERROR"
error.category;    // "retryable"
error.message;     // "Connection refused"
error.isRetryable; // true
error.hint;        // undefined (optional debugging hint)
error.context;     // { host: "clob.polymarket.com", port: 443 }
error.cause;       // originalError (chained)
```

### Serialization

All errors serialize cleanly for logging and monitoring:

```typescript
const json = error.toJSON();
// {
//   name: "NetworkError",
//   message: "Connection refused",
//   code: "NETWORK_ERROR",
//   category: "retryable",
//   retryable: true,
//   context: { host: "clob.polymarket.com", port: 443 }
// }
```

`RateLimitError` includes an extra `retryAfterMs` field in its JSON output.

## Type Guards

Use type guards to narrow errors in catch blocks and Result handlers:

```typescript
import {
  isNetworkError,
  isRateLimitError,
  isAuthError,
  isOrderError,
  isInsufficientBalance,
  isConfigError,
  isSystemError,
  isTimeoutError,
  isOrderNotFoundError,
} from "@polybot/sdk";

function handleError(error: TradingError): void {
  if (isRateLimitError(error)) {
    // Access RateLimitError-specific field
    setTimeout(() => retry(), error.retryAfterMs);
  } else if (isNetworkError(error) || isTimeoutError(error)) {
    retryWithBackoff();
  } else if (isAuthError(error)) {
    refreshCredentials();
  } else if (isInsufficientBalance(error)) {
    pauseTrading();
  }
}
```

## Automatic Classification

Unknown errors (from third-party libraries, network stack, etc.) are auto-classified:

```typescript
import { classifyError } from "@polybot/sdk";

try {
  await fetch("https://clob.polymarket.com/order");
} catch (err) {
  const classified = classifyError(err);
  // classifyError inspects:
  //   - HTTP status codes (429→RateLimitError, 401/403→AuthError, 5xx→SystemError)
  //   - Node.js error codes (ETIMEDOUT, ECONNREFUSED, ENOTFOUND)
  //   - Error message patterns ("timeout", "rate limit", "fetch failed")
  //   - Falls back to SystemError for unrecognized errors
}
```

## Using with Result

The SDK uses `Result<T, E>` instead of thrown exceptions in domain code:

```typescript
import { isOk, isErr, unwrap } from "@polybot/sdk";

const result = await executor.submit(order);

if (isErr(result)) {
  const error = result.error; // TradingError
  if (error.isRetryable) {
    // Safe to retry
  }
  return;
}

const orderResult = unwrap(result); // Unwrap or throw
```

## Strategy Tick Loop Pattern

In the strategy tick loop, all errors from user-supplied code are caught and emitted as events:

```typescript
// The SDK wraps your detector/guards/exits in try-catch internally.
// If your detector throws, the tick loop survives and emits an error event:
//   { type: "error_occurred", error: classifyError(thrown) }
//
// You can listen for these:
strategy.onSdk("error_occurred", (event) => {
  logger.error("Strategy error", event.error.toJSON());
});
```
