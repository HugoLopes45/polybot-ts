# Clock Injection

Injectable clock for deterministic testing — no `Date.now()` in domain code.

## The Problem

```typescript
// ❌ Not testable - depends on real time
function shouldExit(position: Position): boolean {
  const elapsed = Date.now() - position.openedAt;
  return elapsed > 3600000; // 1 hour
}
```

## The Solution

```typescript
import { Clock, SystemClock, FakeClock } from "@polybot/sdk";

// Clock interface
interface Clock {
  now(): number;  // Returns milliseconds since epoch
}

// Real time (production)
const clock = SystemClock;  // Note: SystemClock is a const, not a class

// Fake time (testing)
const fakeClock = new FakeClock(0);  // Start at time 0
fakeClock.set(1000);  // Set to 1 second
```

## Using in Tests

```typescript
import { FakeClock } from "@polybot/sdk";

test("position exits after 1 hour", () => {
  const clock = new FakeClock(0);

  // Advance time by 2 hours
  clock.advance(2 * 3600 * 1000);

  const position = Position.create({
    openedAt: clock.now(),
    clock,
  });

  expect(position.shouldExit()).toBe(true);
});
```

## FakeClock API

```typescript
const clock = new FakeClock(0);  // Optional start time in ms

clock.now();           // Get current time
clock.set(1000);       // Set absolute time
clock.advance(500);    // Advance time by 500ms
```

## Duration Helpers

```typescript
import { Duration } from "@polybot/sdk";

const oneMinute = Duration.minutes(1);    // 60000
const oneHour = Duration.hours(1);        // 3600000
const fiveSeconds = Duration.seconds(5);  // 5000
const ms = Duration.ms(100);              // 100
```

## Components Supporting Clock

- `TokenBucketRateLimiter` — Rate limiting
- `BuiltStrategy` — Strategy tick loop
- `Cache` — TTL-based caching
- All time-dependent SDK components

## Best Practice

Never use `Date.now()` directly in domain code. Always inject a `Clock`:

```typescript
// ✅ Injectable
function createPosition(config: { clock: Clock; ... }) {
  const now = config.clock.now();
}

// ❌ Direct
function createPosition() {
  const now = Date.now();
}
```
