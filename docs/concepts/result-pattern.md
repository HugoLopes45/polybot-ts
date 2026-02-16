# Result Pattern

`Result<T, E>` provides explicit error handling without exceptions in domain code.

## The Problem with Exceptions

```typescript
// ❌ Exceptions break the flow
function processOrder(order: Order): OrderResult {
  try {
    validate(order);
    return submit(order);
  } catch (e) {
    // Where to handle? Who catches?
    throw e;
  }
}
```

## The Result Pattern

```typescript
import { ok, err, isOk, isErr, unwrap, unwrapOr } from "@polybot/sdk";
import type { Result } from "@polybot/sdk";

function divide(a: Decimal, b: Decimal): Result<Decimal, string> {
  if (b.isZero()) {
    return err("Division by zero");
  }
  return ok(a.div(b));
}

// Check result with type guards
const result = divide(Decimal.from(10), Decimal.from(0));

if (isOk(result)) {
  result.value;  // TypeScript knows it's safe
} else {
  result.error; // "Division by zero"
}
```

## Core API

### Factory Functions

```typescript
import { ok, err } from "@polybot/sdk";

const success = ok(42);           // { ok: true, value: 42 }
const failure = err("not found"); // { ok: false, error: "not found" }
```

### Type Guards

```typescript
import { isOk, isErr } from "@polybot/sdk";

if (isOk(result)) {
  result.value; // TypeScript narrows to success type
}

if (isErr(result)) {
  result.error; // TypeScript narrows to error type
}
```

### Utilities

| Function | Description |
|----------|-------------|
| `unwrap(result)` | Extract value or throw error |
| `unwrapOr(result, fallback)` | Extract value or return fallback |
| `map(result, fn)` | Transform success value |
| `mapErr(result, fn)` | Transform error value |
| `flatMap(result, fn)` | Chain fallible operations |

## Transforming Results

```typescript
import { map, mapErr, flatMap } from "@polybot/sdk";

// Transform success value
const doubled = map(ok(21), n => n * 2);  // ok(42)

// Transform error
const friendly = mapErr(err("ERR_NOT_FOUND"), e => `Error: ${e}`);

// Chain operations
const result = flatMap(parseInput(text), input =>
  flatMap(validateInput(input), validated =>
    processInput(validated)
  )
);
```

## Extracting Values

```typescript
import { unwrap, unwrapOr } from "@polybot/sdk";

// Unwrap - throws if error (use at boundaries only)
const value = unwrap(result);

// Unwrap with fallback - safe
const safeValue = unwrapOr(result, 0);
```

## Error Handling

```typescript
import { isNetworkError, isRateLimitError } from "@polybot/sdk";

const result = await executor.submit(order);

if (isErr(result)) {
  const error = result.error;

  if (isNetworkError(error)) {
    // Retry
  } else if (isRateLimitError(error)) {
    // Back off
  }
}
```

## Best Practices

1. **Use type guards** — `isOk()` and `isErr()` for safe checking
2. **Avoid `unwrap()`** — Only use at system boundaries
3. **Compose with utilities** — Use `map()`, `flatMap()` for transformations
4. **Return `Result`** — All domain operations should return `Result`

## What's Next?

- [Clock Injection](/concepts/clock-injection) — Deterministic testing
- [Risk Management](/guides/risk-management) — Using guards
