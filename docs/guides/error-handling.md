# Error Handling

TradingError hierarchy and error classification.

## Error Types

```typescript
import { 
  TradingError,
  isNetworkError,
  isRateLimitError,
  isOrderError,
  isAuthError 
} from "@polybot/sdk";

if (result.isErr()) {
  const error = result.error;
  
  if (isNetworkError(error)) {
    // Retry with backoff
  } else if (isRateLimitError(error)) {
    // Wait and retry
  } else if (isAuthError(error)) {
    // Check credentials
  } else if (isOrderError(error)) {
    // Check order params
  }
}
```

## Error Properties

```typescript
error.code;      // Error code
error.message;   // Human-readable message
error.hint;      // Actionable debugging hint
error.cause;     // Chained error
```
