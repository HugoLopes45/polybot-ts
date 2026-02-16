# Installation

## Prerequisites

- **Node.js** >= 20.0.0
- **pnpm** >= 9.0.0 (recommended)

## Install the SDK

```bash
pnpm add @polybot/sdk
# or: npm install @polybot/sdk
# or: yarn add @polybot/sdk
```

## TypeScript Configuration

The SDK requires TypeScript 5.7+ with strict mode enabled:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

## Verify Installation

```typescript
import { Decimal, conditionId, marketTokenId } from "@polybot/sdk";

const price = Decimal.from("0.65");
const condId = conditionId("0x123abc...");
const tokenId = marketTokenId("yes-token");

// "0.65"
```

## What's Next?

- [Quick Start Guide](/getting-started/quick-start) — Build your first trading bot
- [Authentication](/getting-started/authentication) — Set up API keys
- [Configuration](/getting-started/configuration) — SDK configuration options
