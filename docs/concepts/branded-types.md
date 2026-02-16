# Branded Types

Type-safe identifiers that prevent mixing up different ID types at compile time.

## Problem

```typescript
// ❌ Unsafe - all strings
function getMarket(id: string) { /* ... */ }
function getToken(id: string) { /* ... */ }

getMarket("0xabc");   // Works but error-prone
getToken("0xabc");    // Same type, no type safety
```

## Solution: Branded Types

```typescript
import { conditionId, marketTokenId } from "@polybot/sdk";
import type { ConditionId, MarketTokenId } from "@polybot/sdk";

// Factory functions create branded IDs
const cid = conditionId("0xabc123...");
const tokenId = marketTokenId("yes-token");

// ✅ Type-safe - compiler catches mistakes
function getMarket(id: ConditionId) { /* ... */ }
function getToken(id: MarketTokenId) { /* ... */ }

getMarket(tokenId);   // ❌ Type error!
getToken(cid);        // ❌ Type error!
```

## Available Brands

| Brand | Use Case |
|-------|----------|
| `ConditionId` | Market condition identifier |
| `MarketTokenId` | YES/NO token identifier |
| `ClientOrderId` | Client-generated order ID |
| `ExchangeOrderId` | Exchange-assigned order ID |
| `EthAddress` | Ethereum wallet address |

## Factory Functions

```typescript
import {
  conditionId,
  marketTokenId,
  clientOrderId,
  exchangeOrderId
} from "@polybot/sdk";
import { ethAddress } from "@polybot/sdk/lib/ethereum";

conditionId("0x...");       // ConditionId
marketTokenId("yes-token"); // MarketTokenId
clientOrderId("order-123"); // ClientOrderId
exchangeOrderId("0x.../1"); // ExchangeOrderId
ethAddress("0x...");        // EthAddress (from lib/ethereum)
```

## Validation

Factory functions validate inputs and throw on invalid values:

```typescript
conditionId("");  // ❌ Throws: "ConditionId cannot be empty"
ethAddress("abc"); // ❌ Throws: "EthAddress must start with 0x"
```

## Extracting Raw Values

```typescript
import { idToString } from "@polybot/sdk";

const cid = conditionId("0xabc");
const raw = idToString(cid);  // "0xabc"
```

## Zero Runtime Cost

Branding uses TypeScript's type system only — no runtime overhead:

```typescript
// Compiled JavaScript - no trace of branding
const id = conditionId("0xabc");
// → const id = "0xabc";
```

## What's Next?

- [Immutability](/concepts/immutability) — Functional state management
