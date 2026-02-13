import { describe, expect, it } from "vitest";
import { Cache } from "../lib/cache/index.js";
import { TokenBucketRateLimiter } from "../lib/http/rate-limiter.js";
import { ErrorCategory, RateLimitError } from "../shared/errors.js";
import { conditionId } from "../shared/identifiers.js";
import { isErr, isOk } from "../shared/result.js";
import { FakeClock } from "../shared/time.js";
import { MarketService } from "./market-service.js";
import type { MarketInfo } from "./types.js";

const MARKET_A: MarketInfo = {
	conditionId: conditionId("cond-a"),
	questionId: "q-1",
	question: "Will it rain?",
	description: "Weather market",
	active: true,
	closed: false,
	endDate: "2025-12-31",
};

const MARKET_B: MarketInfo = {
	conditionId: conditionId("cond-b"),
	questionId: "q-2",
	question: "Will it snow?",
	description: "Snow market",
	active: true,
	closed: false,
	endDate: "2025-12-31",
};

describe("MarketService", () => {
	describe("getMarket", () => {
		it("returns ok with market info from deps", async () => {
			const deps = {
				getMarket: async () => MARKET_A,
				searchMarkets: async () => [],
			};
			const service = new MarketService(deps);

			const result = await service.getMarket(conditionId("cond-a"));

			expect(isOk(result)).toBe(true);
			if (isOk(result)) {
				expect(result.value.question).toBe("Will it rain?");
			}
		});

		it("returns err when market not found", async () => {
			const deps = {
				getMarket: async () => null,
				searchMarkets: async () => [],
			};
			const service = new MarketService(deps);

			const result = await service.getMarket(conditionId("cond-missing"));

			expect(isErr(result)).toBe(true);
			if (isErr(result)) {
				expect(result.error.code).toBe("MARKET_NOT_FOUND");
				expect(result.error.category).toBe(ErrorCategory.NonRetryable);
			}
		});

		it("caches result — second call does not hit deps", async () => {
			let callCount = 0;
			const deps = {
				getMarket: async () => {
					callCount++;
					return MARKET_A;
				},
				searchMarkets: async () => [],
			};
			const clock = new FakeClock(1000);
			const service = new MarketService(deps, { clock, cacheTtlMs: 60_000 });

			await service.getMarket(conditionId("cond-a"));
			await service.getMarket(conditionId("cond-a"));

			expect(callCount).toBe(1);
		});

		it("cache expires after TTL — call after advance hits deps again", async () => {
			let callCount = 0;
			const deps = {
				getMarket: async () => {
					callCount++;
					return MARKET_A;
				},
				searchMarkets: async () => [],
			};
			const clock = new FakeClock(1000);
			const service = new MarketService(deps, { clock, cacheTtlMs: 5_000 });

			await service.getMarket(conditionId("cond-a"));
			clock.advance(6_000);
			await service.getMarket(conditionId("cond-a"));

			expect(callCount).toBe(2);
		});
	});

	describe("searchMarkets", () => {
		it("returns ok with list from deps", async () => {
			const deps = {
				getMarket: async () => null,
				searchMarkets: async () => [MARKET_A, MARKET_B],
			};
			const service = new MarketService(deps);

			const result = await service.searchMarkets("weather");

			expect(isOk(result)).toBe(true);
			if (isOk(result)) {
				expect(result.value).toHaveLength(2);
				expect(result.value[0]?.question).toBe("Will it rain?");
			}
		});

		it("returns err when deps throw", async () => {
			const deps = {
				getMarket: async () => null,
				searchMarkets: async (): Promise<MarketInfo[]> => {
					throw new Error("connection refused via econnrefused");
				},
			};
			const service = new MarketService(deps);

			const result = await service.searchMarkets("weather");

			expect(isErr(result)).toBe(true);
			if (isErr(result)) {
				expect(result.error.category).toBe(ErrorCategory.Retryable);
			}
		});

		describe("with optional cache", () => {
			it("cache hit returns cached result without calling API", async () => {
				let callCount = 0;
				const deps = {
					getMarket: async () => null,
					searchMarkets: async () => {
						callCount++;
						return [MARKET_A];
					},
				};
				const cache = new Cache<MarketInfo[]>({ ttl: 60_000, maxSize: 100 });
				const clock = new FakeClock(1000);
				const service = new MarketService(deps, { clock, searchCache: cache });

				await service.searchMarkets("weather");
				await service.searchMarkets("weather");

				expect(callCount).toBe(1);
			});

			it("cache miss calls API and caches result", async () => {
				let callCount = 0;
				const deps = {
					getMarket: async () => null,
					searchMarkets: async () => {
						callCount++;
						return [MARKET_A];
					},
				};
				const cache = new Cache<MarketInfo[]>({ ttl: 60_000, maxSize: 100 });
				const clock = new FakeClock(1000);
				const service = new MarketService(deps, { clock, searchCache: cache });

				await service.searchMarkets("weather");

				expect(callCount).toBe(1);
				expect(cache.get("weather")).toEqual([MARKET_A]);
			});

			it("different queries are cached separately", async () => {
				const deps = {
					getMarket: async () => null,
					searchMarkets: async (query: string) => {
						return query === "weather" ? [MARKET_A] : [MARKET_B];
					},
				};
				const cache = new Cache<MarketInfo[]>({ ttl: 60_000, maxSize: 100 });
				const clock = new FakeClock(1000);
				const service = new MarketService(deps, { clock, searchCache: cache });

				await service.searchMarkets("weather");
				await service.searchMarkets("snow");

				expect(cache.get("weather")).toEqual([MARKET_A]);
				expect(cache.get("snow")).toEqual([MARKET_B]);
			});
		});

		describe("with optional rate limiter", () => {
			it("rate limiter blocks when exhausted", async () => {
				const deps = {
					getMarket: async () => null,
					searchMarkets: async () => [MARKET_A],
				};
				const clock = new FakeClock(1000);
				const rateLimiter = new TokenBucketRateLimiter({
					capacity: 1,
					refillRate: 0,
					clock,
				});
				const service = new MarketService(deps, { clock, rateLimiter });

				await service.searchMarkets("weather");
				const result = await service.searchMarkets("weather");

				expect(isErr(result)).toBe(true);
				if (isErr(result)) {
					expect(result.error).toBeInstanceOf(RateLimitError);
				}
			});

			it("rate limiter allows when tokens available", async () => {
				let callCount = 0;
				const deps = {
					getMarket: async () => null,
					searchMarkets: async () => {
						callCount++;
						return [MARKET_A];
					},
				};
				const clock = new FakeClock(1000);
				const rateLimiter = new TokenBucketRateLimiter({
					capacity: 5,
					refillRate: 10,
					clock,
				});
				const service = new MarketService(deps, { clock, rateLimiter });

				await service.searchMarkets("weather");
				await service.searchMarkets("weather");

				expect(callCount).toBe(2);
			});
		});

		describe("with cache and rate limiter", () => {
			it("checks cache first, then rate limiter, then API", async () => {
				let apiCallCount = 0;
				const deps = {
					getMarket: async () => null,
					searchMarkets: async () => {
						apiCallCount++;
						return [MARKET_A];
					},
				};
				const clock = new FakeClock(1000);
				const cache = new Cache<MarketInfo[]>({ ttl: 60_000, maxSize: 100 });
				const rateLimiter = new TokenBucketRateLimiter({
					capacity: 1,
					refillRate: 0,
					clock,
				});
				const service = new MarketService(deps, { clock, searchCache: cache, rateLimiter });

				await service.searchMarkets("weather");
				const result = await service.searchMarkets("weather");

				expect(apiCallCount).toBe(1);
				expect(isOk(result)).toBe(true);
			});

			it("cache miss triggers rate limiter check before API", async () => {
				let apiCallCount = 0;
				const deps = {
					getMarket: async () => null,
					searchMarkets: async () => {
						apiCallCount++;
						return [MARKET_A];
					},
				};
				const clock = new FakeClock(1000);
				const cache = new Cache<MarketInfo[]>({ ttl: 60_000, maxSize: 100 });
				const rateLimiter = new TokenBucketRateLimiter({
					capacity: 0,
					refillRate: 0,
					clock,
				});
				const service = new MarketService(deps, { clock, searchCache: cache, rateLimiter });

				const result = await service.searchMarkets("weather");

				expect(apiCallCount).toBe(0);
				expect(isErr(result)).toBe(true);
				if (isErr(result)) {
					expect(result.error).toBeInstanceOf(RateLimitError);
				}
			});
		});
	});
});
