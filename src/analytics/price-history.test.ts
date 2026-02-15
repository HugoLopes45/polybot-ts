import { describe, expect, it } from "vitest";
import { Cache } from "../lib/cache/index.js";
import { TokenBucketRateLimiter } from "../lib/http/rate-limiter.js";
import { Decimal } from "../shared/decimal.js";
import { RateLimitError } from "../shared/errors.js";
import { conditionId } from "../shared/identifiers.js";
import { isErr, isOk } from "../shared/result.js";
import { FakeClock } from "../shared/time.js";
import type { PriceHistoryProvider, PriceInterval, PricePoint } from "./price-history.js";
import { PriceHistoryClient } from "./price-history.js";

const COND_A = conditionId("cond-a");

const makePricePoints = (...prices: [number, number][]): PricePoint[] =>
	prices.map(([ts, p]) => ({ timestampMs: ts, price: Decimal.from(p) }));

const makeProvider = (overrides: Partial<PriceHistoryProvider> = {}): PriceHistoryProvider => ({
	getPriceHistory: async () => [],
	...overrides,
});

describe("PriceHistoryClient", () => {
	describe("getPriceHistory", () => {
		it("returns ok with price points from provider", async () => {
			const points = makePricePoints([1000, 0.5], [2000, 0.55]);
			const provider = makeProvider({
				getPriceHistory: async () => points,
			});
			const client = new PriceHistoryClient(provider);
			const result = await client.getPriceHistory(COND_A, "1h");
			expect(isOk(result)).toBe(true);
			if (isOk(result)) {
				expect(result.value).toHaveLength(2);
				expect(result.value[0]?.price.toString()).toBe("0.5");
			}
		});

		it("returns err when provider throws", async () => {
			const provider = makeProvider({
				getPriceHistory: async () => {
					throw new Error("connection refused via econnrefused");
				},
			});
			const client = new PriceHistoryClient(provider);
			const result = await client.getPriceHistory(COND_A, "1h");
			expect(isErr(result)).toBe(true);
		});

		it("returns ok with empty array for no history", async () => {
			const client = new PriceHistoryClient(makeProvider());
			const result = await client.getPriceHistory(COND_A, "1h");
			expect(isOk(result)).toBe(true);
			if (isOk(result)) expect(result.value).toEqual([]);
		});

		it("rejects invalid interval", async () => {
			const client = new PriceHistoryClient(makeProvider());
			const result = await client.getPriceHistory(COND_A, "2h" as PriceInterval);
			expect(isErr(result)).toBe(true);
			if (isErr(result)) expect(result.error.code).toBe("INVALID_INTERVAL");
		});

		it.each(["max", "1w", "1d", "6h", "1h"] as const)(
			"accepts valid interval %s",
			async (interval) => {
				const client = new PriceHistoryClient(makeProvider());
				const result = await client.getPriceHistory(COND_A, interval);
				expect(isOk(result)).toBe(true);
			},
		);

		it("rejects zero limit", async () => {
			const client = new PriceHistoryClient(makeProvider());
			const result = await client.getPriceHistory(COND_A, "1h", 0);
			expect(isErr(result)).toBe(true);
			if (isErr(result)) expect(result.error.code).toBe("INVALID_LIMIT");
		});

		it("rejects negative limit", async () => {
			const client = new PriceHistoryClient(makeProvider());
			const result = await client.getPriceHistory(COND_A, "1h", -5);
			expect(isErr(result)).toBe(true);
			if (isErr(result)) expect(result.error.code).toBe("INVALID_LIMIT");
		});

		it("sorts results by timestampMs ascending", async () => {
			const points = makePricePoints([3000, 0.6], [1000, 0.5], [2000, 0.55]);
			const provider = makeProvider({
				getPriceHistory: async () => points,
			});
			const client = new PriceHistoryClient(provider);
			const result = await client.getPriceHistory(COND_A, "1h");
			expect(isOk(result)).toBe(true);
			if (isOk(result)) {
				expect(result.value[0]?.timestampMs).toBe(1000);
				expect(result.value[1]?.timestampMs).toBe(2000);
				expect(result.value[2]?.timestampMs).toBe(3000);
			}
		});
	});

	describe("with rate limiter", () => {
		it("returns RateLimitError when exhausted", async () => {
			const clock = new FakeClock(1000);
			const rateLimiter = new TokenBucketRateLimiter({
				capacity: 1,
				refillRate: 0,
				clock,
			});
			const provider = makeProvider({
				getPriceHistory: async () => makePricePoints([1000, 0.5]),
			});
			const client = new PriceHistoryClient(provider, { rateLimiter });
			await client.getPriceHistory(COND_A, "1h");
			const result = await client.getPriceHistory(COND_A, "1d");
			expect(isErr(result)).toBe(true);
			if (isErr(result)) expect(result.error).toBeInstanceOf(RateLimitError);
		});
	});

	describe("with cache", () => {
		it("returns cached result on second call", async () => {
			let callCount = 0;
			const provider = makeProvider({
				getPriceHistory: async () => {
					callCount++;
					return makePricePoints([1000, 0.5]);
				},
			});
			const cache = new Cache<PricePoint[]>({ ttl: 60_000, maxSize: 100 });
			const client = new PriceHistoryClient(provider, { cache });
			await client.getPriceHistory(COND_A, "1h");
			await client.getPriceHistory(COND_A, "1h");
			expect(callCount).toBe(1);
		});

		it("different intervals are cached separately", async () => {
			let callCount = 0;
			const provider = makeProvider({
				getPriceHistory: async () => {
					callCount++;
					return makePricePoints([1000, 0.5]);
				},
			});
			const cache = new Cache<PricePoint[]>({ ttl: 60_000, maxSize: 100 });
			const client = new PriceHistoryClient(provider, { cache });
			await client.getPriceHistory(COND_A, "1h");
			await client.getPriceHistory(COND_A, "1d");
			expect(callCount).toBe(2);
		});
	});
});
