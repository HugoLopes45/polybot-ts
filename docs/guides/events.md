# Events

EventDispatcher for SDK and domain events.

## SDK Events

All SDK event names use snake_case:

```typescript
import { EventDispatcher } from "@polybot/sdk";

const dispatcher = new EventDispatcher();

dispatcher.onSdk("order_placed", (event) => {
  // Order submitted to exchange
});

dispatcher.onSdk("position_opened", (event) => {
  // New position created
});

dispatcher.onSdk("position_closed", (event) => {
  // Position exited
});

dispatcher.onSdk("guard_blocked", (event) => {
  // Risk guard rejected entry
});

dispatcher.onSdk("error_occurred", (event) => {
  // Error in strategy execution
});
```

## Available SDK Events

| Event | Description |
|-------|-------------|
| `order_placed` | Order submitted to exchange |
| `order_cancelled` | Order cancellation confirmed |
| `fill_received` | Fill notification received |
| `position_opened` | New position created |
| `position_closed` | Position fully exited |
| `position_reduced` | Position partially closed |
| `guard_blocked` | Risk guard rejected entry |
| `state_changed` | Strategy state transition |
| `watchdog_alert` | Connectivity watchdog alert |
| `error_occurred` | Error in strategy execution |
| `tick_dropped` | Tick rejected by guards |

## Domain Events

```typescript
dispatcher.onDomain("opportunityDetected", (event) => {
  // Custom domain event
});
```
