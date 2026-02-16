# Market Discovery

MarketCatalog, scanner, and arbitrage detection.

## Market Catalog

```typescript
import { MarketCatalog } from "@polybot/sdk";

const deps = {
  getMarket: async (id) => { /* fetch market by condition ID */ },
  searchMarkets: async (query) => { /* search markets */ },
  getTrending: async (limit) => { /* optional */ },
  getTopByVolume: async (limit) => { /* optional */ },
};

const catalog = new MarketCatalog(deps, {
  cacheTtlMs: 60_000,
  maxCacheSize: 1000,
});

const markets = await catalog.search("election");
const market = await catalog.get(conditionId);
```

## Optional Discovery Methods

```typescript
const deps = {
  getMarket: async (id) => { /* required */ },
  searchMarkets: async (query) => { /* required */ },

  // Optional discovery methods
  getTrending: async (limit) => { /* top trending markets */ },
  getTopByVolume: async (limit) => { /* highest volume */ },
  getTopByLiquidity: async (limit) => { /* deepest orderbooks */ },
  getByCategory: async (category) => { /* filter by category */ },
  getActiveEvents: async () => { /* active event markets */ },
};
```

## Rate Limiting

```typescript
import { TokenBucketRateLimiter } from "@polybot/sdk";

const rateLimiter = TokenBucketRateLimiter.create(/* config */);

const catalog = new MarketCatalog(deps, {
  rateLimiter,
});
```
