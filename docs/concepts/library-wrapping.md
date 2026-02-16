# Library Wrapping

All external dependencies are wrapped in `lib/` — enabling dependency injection and easier testing.

## Why Wrap?

```typescript
// ❌ Direct dependency - hard to test
import { Client } from "some-http-library";

class MarketService {
  async fetchPrice() {
    const client = new Client();
    return client.get("/price");
  }
}

// ✅ Wrapped - injectable
// lib/http/client.ts
interface HttpClient {
  get<T>(url: string): Promise<T>;
}

// market/service.ts
class MarketService {
  constructor(private http: HttpClient) {}
  
  async fetchPrice() {
    return this.http.get<Price>("/price");
  }
}
```

## Wrapper Locations

| Wrapper | Wraps | Purpose |
|---------|-------|---------|
| `lib/ethereum/` | viem | Blockchain interactions |
| `lib/clob/` | @polymarket/clob-client | CLOB API |
| `lib/websocket/` | ws | WebSocket connections |
| `lib/http/` | fetch | Rate limiting |
| `lib/logger/` | pino | Structured logging |
| `lib/validation/` | zod | Schema validation |

## Example: Custom Rate Limiter

```typescript
import { TokenBucketRateLimiter } from "@polybot/sdk";

// Use built-in
const limiter = new TokenBucketRateLimiter({
  capacity: 10,
  refillRate: 10,
});

// Or inject custom
class MyLimiter implements IRateLimiter {
  async acquire(): Promise<void> { /* ... */ }
}

const custom = new MyLimiter();
```

## Dependency Inversion

```
Domain Code (what you write)
         ↓ depends on interfaces
   lib/* (abstractions)
         ↓ implemented by
External Libraries (node_modules)
```

## Benefits

1. **Testability** — Mock wrappers in tests
2. **Swapability** — Change implementations without touching domain
3. **Consistency** — Unified API across the SDK
4. **Abstraction** — Domain code doesn't know about external libs
