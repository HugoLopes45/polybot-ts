# CTF Operations

Conditional Token Framework (CTF) operations for splitting, merging, and redeeming prediction market tokens.

## What is CTF?

The Conditional Token Framework is the on-chain smart contract system underpinning Polymarket. It creates YES/NO token pairs for each prediction market. Key operations:

- **Split**: Convert USDC collateral into equal amounts of YES and NO tokens
- **Merge**: Convert equal amounts of YES and NO tokens back into USDC
- **Redeem**: After market resolution, exchange winning tokens for USDC payout

## CtfClient

Thin wrapper around the contract writer for CTF operations:

```typescript
import { CtfClient, conditionId, Decimal } from "@polybot/sdk";

const ctf = new CtfClient(
  { collateralAddress: "0xUsdc..." },
  contractWriter,
);

// Split $100 USDC into 100 YES + 100 NO tokens
const splitResult = await ctf.split(conditionId("0xAbc..."), Decimal.from("100"));

// Merge 50 YES + 50 NO back into $50 USDC
const mergeResult = await ctf.merge(conditionId("0xAbc..."), Decimal.from("50"));

// Redeem winning tokens after resolution
const redeemResult = await ctf.redeem(conditionId("0xAbc..."));
```

All methods return `Result<string, TradingError>` where the success value is the transaction hash.

## CachingTokenResolver

Resolve condition IDs to their YES/NO token ID pairs with LRU caching and thundering herd prevention:

```typescript
import { CachingTokenResolver } from "@polybot/sdk";

const resolver = new CachingTokenResolver({
  reader: contractReader,
  ttl: 60_000,    // Cache for 60 seconds (default)
  maxSize: 256,   // Max cached entries (default)
});

const result = await resolver.resolve(conditionId("0xAbc..."));
if (isOk(result)) {
  result.value.yesTokenId; // MarketTokenId for YES
  result.value.noTokenId;  // MarketTokenId for NO
}
```

### Thundering Herd Prevention

When multiple callers request the same condition ID simultaneously, only one contract read is made. Subsequent callers receive the same in-flight promise — preventing redundant on-chain calls.

## When to Use CTF Operations

| Scenario | Operation |
|----------|-----------|
| Market making (need both sides) | `split()` then sell one side |
| Dutch book arbitrage recovery | `merge()` YES + NO into collateral |
| Market resolved, holding winning tokens | `redeem()` |
| Need token IDs for a new market | `CachingTokenResolver.resolve()` |
