import { describe, expect, it } from "vitest";
import { Cache } from "../lib/cache/index.js";
import { TokenBucketRateLimiter } from "../lib/http/rate-limiter.js";
import { ErrorCategory, RateLimitError } from "../shared/errors.js";
import { conditionId } from "../shared/identifiers.js";
import { isErr, isOk } from "../shared/result.js";
import { FakeClock } from "../shared/time.js";
import { MarketCatalog } from "./market-catalog.js";
import type { MarketProviders } from "./market-catalog.js";
import type { MarketInfo } from "./types.js";

const MARKET_A: MarketInfo = {
	conditionId: conditionId("cond-a"),
	questionId: "q-1",
	question: "Will it rain?",
	description: "Weather market",
	status: "active",
	endDate: "2025-12-31",
};

const MARKET_B: MarketInfo = {
	conditionId: conditionId("cond-b"),
	questionId: "q-2",
	question: "Will it snow?",
	description: "Snow market",
	status: "active",
	endDate: "2025-12-31",
};

describe("MarketCatalog", () => {
	describe("getMarket", () => {
		it("returns ok with market info from deps", async () => {
			const deps = {
				getMarket: async () => MARKET_A,
				searchMarkets: async () => [],
			};
			const service = new MarketCatalog(deps);

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
			const service = new MarketCatalog(deps);

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
			const service = new MarketCatalog(deps, { clock, cacheTtlMs: 60_000 });

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
			const service = new MarketCatalog(deps, { clock, cacheTtlMs: 5_000 });

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
			const service = new MarketCatalog(deps);

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
			const service = new MarketCatalog(deps);

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
				const service = new MarketCatalog(deps, { clock, searchCache: cache });

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
				const service = new MarketCatalog(deps, { clock, searchCache: cache });

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
				const service = new MarketCatalog(deps, { clock, searchCache: cache });

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
				const service = new MarketCatalog(deps, { clock, rateLimiter });

				await service.searchMarkets("weather");
				const result = await service.searchMarkets("weather");

				expect(isErr(result)).toBe(true);
				if (isErr(result)) {
					expect(result.error).toBeInstanceOf(RateLimitError);
				}
			});

			it("rate limiter returns Infinity retryAfterMs for non-refilling limiter", async () => {
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
				const service = new MarketCatalog(deps, { clock, rateLimiter });

				await service.searchMarkets("weather");
				const result = await service.searchMarkets("weather");

				expect(isErr(result)).toBe(true);
				if (isErr(result)) {
					const rle = result.error as RateLimitError;
					expect(rle.retryAfterMs).toBe(Number.POSITIVE_INFINITY);
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
				const service = new MarketCatalog(deps, { clock, rateLimiter });

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
				const service = new MarketCatalog(deps, { clock, searchCache: cache, rateLimiter });

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
					capacity: 1,
					refillRate: 0,
					clock,
				});
				rateLimiter.tryAcquire();
				const service = new MarketCatalog(deps, { clock, searchCache: cache, rateLimiter });

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

describe("MarketCatalog discovery methods", () => {
	const makeDeps = (overrides: Partial<MarketProviders> = {}): MarketProviders => ({
		getMarket: async () => null,
		searchMarkets: async () => [],
		...overrides,
	});

	describe("getTrending", () => {
		it("returns ok with markets from provider", async () => {
			const deps = makeDeps({ getTrending: async () => [MARKET_A, MARKET_B] });
			const catalog = new MarketCatalog(deps);
			const result = await catalog.getTrending(10);
			expect(isOk(result)).toBe(true);
			if (isOk(result)) expect(result.value).toHaveLength(2);
		});

		it("returns err when provider not implemented", async () => {
			const catalog = new MarketCatalog(makeDeps());
			const result = await catalog.getTrending(10);
			expect(isErr(result)).toBe(true);
			if (isErr(result)) expect(result.error.code).toBe("NOT_SUPPORTED");
		});
	});

	describe("getTopByVolume", () => {
		it("returns ok with markets from provider", async () => {
			const deps = makeDeps({ getTopByVolume: async () => [MARKET_A] });
			const catalog = new MarketCatalog(deps);
			const result = await catalog.getTopByVolume(5);
			expect(isOk(result)).toBe(true);
			if (isOk(result)) expect(result.value).toHaveLength(1);
		});

		it("returns err when provider not implemented", async () => {
			const catalog = new MarketCatalog(makeDeps());
			const result = await catalog.getTopByVolume(5);
			expect(isErr(result)).toBe(true);
			if (isErr(result)) expect(result.error.code).toBe("NOT_SUPPORTED");
		});
	});

	describe("getTopByLiquidity", () => {
		it("returns ok with markets from provider", async () => {
			const deps = makeDeps({ getTopByLiquidity: async () => [MARKET_B] });
			const catalog = new MarketCatalog(deps);
			const result = await catalog.getTopByLiquidity(3);
			expect(isOk(result)).toBe(true);
			if (isOk(result)) expect(result.value).toHaveLength(1);
		});

		it("returns err when provider not implemented", async () => {
			const catalog = new MarketCatalog(makeDeps());
			const result = await catalog.getTopByLiquidity(3);
			expect(isErr(result)).toBe(true);
			if (isErr(result)) expect(result.error.code).toBe("NOT_SUPPORTED");
		});
	});

	describe("getByCategory", () => {
		it("returns ok with markets from provider", async () => {
			const deps = makeDeps({ getByCategory: async () => [MARKET_A, MARKET_B] });
			const catalog = new MarketCatalog(deps);
			const result = await catalog.getByCategory("weather");
			expect(isOk(result)).toBe(true);
			if (isOk(result)) expect(result.value).toHaveLength(2);
		});

		it("returns err when provider not implemented", async () => {
			const catalog = new MarketCatalog(makeDeps());
			const result = await catalog.getByCategory("weather");
			expect(isErr(result)).toBe(true);
			if (isErr(result)) expect(result.error.code).toBe("NOT_SUPPORTED");
		});
	});

	describe("getActiveEvents", () => {
		it("returns ok with markets from provider", async () => {
			const deps = makeDeps({ getActiveEvents: async () => [MARKET_A] });
			const catalog = new MarketCatalog(deps);
			const result = await catalog.getActiveEvents();
			expect(isOk(result)).toBe(true);
			if (isOk(result)) expect(result.value).toHaveLength(1);
		});

		it("returns err when provider not implemented", async () => {
			const catalog = new MarketCatalog(makeDeps());
			const result = await catalog.getActiveEvents();
			expect(isErr(result)).toBe(true);
			if (isErr(result)) expect(result.error.code).toBe("NOT_SUPPORTED");
		});
	});

	it("returns ok with empty array for empty results", async () => {
		const deps = makeDeps({ getTrending: async () => [] });
		const catalog = new MarketCatalog(deps);
		const result = await catalog.getTrending(5);
		expect(isOk(result)).toBe(true);
		if (isOk(result)) expect(result.value).toEqual([]);
	});

	it("returns err when provider throws", async () => {
		const deps = makeDeps({
			getTrending: async () => {
				throw new Error("connection refused via econnrefused");
			},
		});
		const catalog = new MarketCatalog(deps);
		const result = await catalog.getTrending(5);
		expect(isErr(result)).toBe(true);
		if (isErr(result)) expect(result.error.category).toBe(ErrorCategory.Retryable);
	});

	describe("getTopByVolume throws handling", () => {
		it("returns err when provider throws", async () => {
			const deps = makeDeps({
				getTopByVolume: async () => {
					throw new Error("connection refused via econnrefused");
				},
			});
			const catalog = new MarketCatalog(deps);
			const result = await catalog.getTopByVolume(5);
			expect(isErr(result)).toBe(true);
			if (isErr(result)) expect(result.error.category).toBe(ErrorCategory.Retryable);
		});

		it("returns ok with empty array for empty results", async () => {
			const deps = makeDeps({ getTopByVolume: async () => [] });
			const catalog = new MarketCatalog(deps);
			const result = await catalog.getTopByVolume(5);
			expect(isOk(result)).toBe(true);
			if (isOk(result)) expect(result.value).toEqual([]);
		});
	});

	describe("getTopByLiquidity throws handling", () => {
		it("returns err when provider throws", async () => {
			const deps = makeDeps({
				getTopByLiquidity: async () => {
					throw new Error("connection refused via econnrefused");
				},
			});
			const catalog = new MarketCatalog(deps);
			const result = await catalog.getTopByLiquidity(3);
			expect(isErr(result)).toBe(true);
			if (isErr(result)) expect(result.error.category).toBe(ErrorCategory.Retryable);
		});

		it("returns ok with empty array for empty results", async () => {
			const deps = makeDeps({ getTopByLiquidity: async () => [] });
			const catalog = new MarketCatalog(deps);
			const result = await catalog.getTopByLiquidity(3);
			expect(isOk(result)).toBe(true);
			if (isOk(result)) expect(result.value).toEqual([]);
		});
	});

	describe("getByCategory throws handling", () => {
		it("returns err when provider throws", async () => {
			const deps = makeDeps({
				getByCategory: async () => {
					throw new Error("connection refused via econnrefused");
				},
			});
			const catalog = new MarketCatalog(deps);
			const result = await catalog.getByCategory("sports");
			expect(isErr(result)).toBe(true);
			if (isErr(result)) expect(result.error.category).toBe(ErrorCategory.Retryable);
		});

		it("returns ok with empty array for empty results", async () => {
			const deps = makeDeps({ getByCategory: async () => [] });
			const catalog = new MarketCatalog(deps);
			const result = await catalog.getByCategory("sports");
			expect(isOk(result)).toBe(true);
			if (isOk(result)) expect(result.value).toEqual([]);
		});
	});

	describe("getActiveEvents throws handling", () => {
		it("returns err when provider throws", async () => {
			const deps = makeDeps({
				getActiveEvents: async () => {
					throw new Error("timeout");
				},
			});
			const catalog = new MarketCatalog(deps);
			const result = await catalog.getActiveEvents();
			expect(isErr(result)).toBe(true);
			if (isErr(result)) expect(result.error.category).toBe(ErrorCategory.Retryable);
		});

		it("returns ok with empty array for empty results", async () => {
			const deps = makeDeps({ getActiveEvents: async () => [] });
			const catalog = new MarketCatalog(deps);
			const result = await catalog.getActiveEvents();
			expect(isOk(result)).toBe(true);
			if (isOk(result)) expect(result.value).toEqual([]);
		});
	});

	it("validates limit >= 1", async () => {
		const deps = makeDeps({ getTrending: async () => [MARKET_A] });
		const catalog = new MarketCatalog(deps);
		const result = await catalog.getTrending(0);
		expect(isErr(result)).toBe(true);
		if (isErr(result)) expect(result.error.code).toBe("INVALID_LIMIT");
	});

	it("rejects NaN limit", async () => {
		const deps = makeDeps({ getTrending: async () => [MARKET_A] });
		const catalog = new MarketCatalog(deps);
		const result = await catalog.getTrending(Number.NaN);
		expect(isErr(result)).toBe(true);
		if (isErr(result)) expect(result.error.code).toBe("INVALID_LIMIT");
	});

	it("rejects Infinity limit", async () => {
		const deps = makeDeps({ getTopByVolume: async () => [MARKET_A] });
		const catalog = new MarketCatalog(deps);
		const result = await catalog.getTopByVolume(Number.POSITIVE_INFINITY);
		expect(isErr(result)).toBe(true);
		if (isErr(result)) expect(result.error.code).toBe("INVALID_LIMIT");
	});

	it("rejects fractional limit", async () => {
		const deps = makeDeps({ getTopByLiquidity: async () => [MARKET_A] });
		const catalog = new MarketCatalog(deps);
		const result = await catalog.getTopByLiquidity(2.5);
		expect(isErr(result)).toBe(true);
		if (isErr(result)) expect(result.error.code).toBe("INVALID_LIMIT");
	});

	it("rejects negative limit", async () => {
		const deps = makeDeps({ getTrending: async () => [MARKET_A] });
		const catalog = new MarketCatalog(deps);
		const result = await catalog.getTrending(-1);
		expect(isErr(result)).toBe(true);
		if (isErr(result)) expect(result.error.code).toBe("INVALID_LIMIT");
	});

	it("rejects empty category string", async () => {
		const deps = makeDeps({ getByCategory: async () => [MARKET_A] });
		const catalog = new MarketCatalog(deps);
		const result = await catalog.getByCategory("");
		expect(isErr(result)).toBe(true);
		if (isErr(result)) expect(result.error.code).toBe("INVALID_CATEGORY");
	});

	it("rejects whitespace-only category string", async () => {
		const deps = makeDeps({ getByCategory: async () => [MARKET_A] });
		const catalog = new MarketCatalog(deps);
		const result = await catalog.getByCategory("   ");
		expect(isErr(result)).toBe(true);
		if (isErr(result)) expect(result.error.code).toBe("INVALID_CATEGORY");
	});

	describe("rate limiter integration with discovery", () => {
		it("getTrending blocks when rate limiter exhausted", async () => {
			const deps = makeDeps({ getTrending: async () => [MARKET_A, MARKET_B] });
			const clock = new FakeClock(1000);
			const rateLimiter = new TokenBucketRateLimiter({
				capacity: 1,
				refillRate: 0,
				clock,
			});
			const catalog = new MarketCatalog(deps, { clock, rateLimiter });

			await catalog.getTrending(10);
			const result = await catalog.getTrending(10);

			expect(isErr(result)).toBe(true);
			if (isErr(result)) {
				expect(result.error).toBeInstanceOf(RateLimitError);
			}
		});

		it("getTopByVolume blocks when rate limiter exhausted", async () => {
			const deps = makeDeps({ getTopByVolume: async () => [MARKET_A] });
			const clock = new FakeClock(1000);
			const rateLimiter = new TokenBucketRateLimiter({
				capacity: 1,
				refillRate: 0,
				clock,
			});
			const catalog = new MarketCatalog(deps, { clock, rateLimiter });

			await catalog.getTopByVolume(5);
			const result = await catalog.getTopByVolume(5);

			expect(isErr(result)).toBe(true);
			if (isErr(result)) {
				expect(result.error).toBeInstanceOf(RateLimitError);
			}
		});

		it("getTopByLiquidity blocks when rate limiter exhausted", async () => {
			const deps = makeDeps({ getTopByLiquidity: async () => [MARKET_B] });
			const clock = new FakeClock(1000);
			const rateLimiter = new TokenBucketRateLimiter({
				capacity: 1,
				refillRate: 0,
				clock,
			});
			const catalog = new MarketCatalog(deps, { clock, rateLimiter });

			await catalog.getTopByLiquidity(3);
			const result = await catalog.getTopByLiquidity(3);

			expect(isErr(result)).toBe(true);
			if (isErr(result)) {
				expect(result.error).toBeInstanceOf(RateLimitError);
			}
		});

		it("getByCategory blocks when rate limiter exhausted", async () => {
			const deps = makeDeps({ getByCategory: async () => [MARKET_A, MARKET_B] });
			const clock = new FakeClock(1000);
			const rateLimiter = new TokenBucketRateLimiter({
				capacity: 1,
				refillRate: 0,
				clock,
			});
			const catalog = new MarketCatalog(deps, { clock, rateLimiter });

			await catalog.getByCategory("weather");
			const result = await catalog.getByCategory("weather");

			expect(isErr(result)).toBe(true);
			if (isErr(result)) {
				expect(result.error).toBeInstanceOf(RateLimitError);
			}
		});

		it("getActiveEvents blocks when rate limiter exhausted", async () => {
			const deps = makeDeps({ getActiveEvents: async () => [MARKET_A] });
			const clock = new FakeClock(1000);
			const rateLimiter = new TokenBucketRateLimiter({
				capacity: 1,
				refillRate: 0,
				clock,
			});
			const catalog = new MarketCatalog(deps, { clock, rateLimiter });

			await catalog.getActiveEvents();
			const result = await catalog.getActiveEvents();

			expect(isErr(result)).toBe(true);
			if (isErr(result)) {
				expect(result.error).toBeInstanceOf(RateLimitError);
			}
		});

		it("discovery allows when tokens available", async () => {
			let callCount = 0;
			const deps = makeDeps({
				getTrending: async () => {
					callCount++;
					return [MARKET_A];
				},
			});
			const clock = new FakeClock(1000);
			const rateLimiter = new TokenBucketRateLimiter({
				capacity: 5,
				refillRate: 10,
				clock,
			});
			const catalog = new MarketCatalog(deps, { clock, rateLimiter });

			await catalog.getTrending(10);
			await catalog.getTrending(10);

			expect(callCount).toBe(2);
		});
	});

	it("classifies provider network errors as retryable", async () => {
		const deps = makeDeps({
			getTrending: async () => {
				throw new Error("ENOTFOUND api.polymarket.com");
			},
		});
		const catalog = new MarketCatalog(deps);
		const result = await catalog.getTrending(5);
		expect(isErr(result)).toBe(true);
		if (isErr(result)) expect(result.error.category).toBe(ErrorCategory.Retryable);
	});

	it("classifies getMarket provider errors via classifyError", async () => {
		const deps = makeDeps({
			getMarket: async () => {
				throw new Error("request timed out");
			},
		});
		const catalog = new MarketCatalog(deps);
		const result = await catalog.getMarket(conditionId("cond-a"));
		expect(isErr(result)).toBe(true);
		if (isErr(result)) expect(result.error.isRetryable).toBe(true);
	});

	it("tracks cache write errors with counter", async () => {
		const deps = makeDeps({ getMarket: async () => MARKET_A });
		const catalog = new MarketCatalog(deps);

		catalog.cache.set = () => {
			throw new Error("cache write failed");
		};

		const result = await catalog.getMarket(conditionId("cond-a"));
		expect(isOk(result)).toBe(true);
		expect(catalog.cacheWriteErrors).toBe(1);

		const result2 = await catalog.getMarket(conditionId("cond-b"));
		expect(isOk(result2)).toBe(true);
		expect(catalog.cacheWriteErrors).toBe(2);
	});

	it("searchCache write errors increment cacheWriteErrors", async () => {
		const cache = new Cache<MarketInfo[]>({ ttl: 60_000, maxSize: 100 });
		cache.set = () => {
			throw new Error("cache write failed");
		};
		const deps = makeDeps({ searchMarkets: async () => [MARKET_A] });
		const catalog = new MarketCatalog(deps, { searchCache: cache });

		const result = await catalog.searchMarkets("query");
		expect(isOk(result)).toBe(true);
		expect(catalog.cacheWriteErrors).toBe(1);
	});

	describe("cache bounds", () => {
		it("evicts oldest entry by expiresAtMs when maxCacheSize exceeded", async () => {
			const clock = new FakeClock(1000);
			let callCount = 0;
			const deps = {
				getMarket: async (id: string) => {
					callCount++;
					return {
						conditionId: conditionId(id),
						questionId: `q-${id}`,
						question: `Question ${id}`,
						description: `Desc ${id}`,
						status: "active",
						endDate: "2025-12-31",
					};
				},
				searchMarkets: async () => [],
			};
			const service = new MarketCatalog(deps, {
				clock,
				cacheTtlMs: 60_000,
				maxCacheSize: 3,
			});

			await service.getMarket(conditionId("a"));
			clock.advance(1000);
			await service.getMarket(conditionId("b"));
			clock.advance(1000);
			await service.getMarket(conditionId("c"));

			expect(callCount).toBe(3);

			clock.advance(1000);
			await service.getMarket(conditionId("d"));

			expect(callCount).toBe(4);

			const resA = await service.getMarket(conditionId("a"));
			expect(isOk(resA)).toBe(true);
			expect(callCount).toBe(5);
		});

		it("uses default maxCacheSize of 1000", async () => {
			const deps = {
				getMarket: async () => MARKET_A,
				searchMarkets: async () => [],
			};
			const service = new MarketCatalog(deps);

			for (let i = 0; i < 1000; i++) {
				await service.getMarket(conditionId(`cond-${i}`));
			}

			const result = await service.getMarket(conditionId("cond-0"));
			expect(isOk(result)).toBe(true);
		});

		it("respects custom maxCacheSize configuration", async () => {
			const clock = new FakeClock(1000);
			const deps = {
				getMarket: async (id: string) => ({
					conditionId: conditionId(id),
					questionId: `q-${id}`,
					question: `Question ${id}`,
					description: `Desc ${id}`,
					status: "active",
					endDate: "2025-12-31",
				}),
				searchMarkets: async () => [],
			};
			const service = new MarketCatalog(deps, {
				clock,
				cacheTtlMs: 60_000,
				maxCacheSize: 2,
			});

			await service.getMarket(conditionId("a"));
			await service.getMarket(conditionId("b"));
			await service.getMarket(conditionId("c"));

			const resA = await service.getMarket(conditionId("a"));
			expect(isOk(resA)).toBe(true);
		});
	});
});
