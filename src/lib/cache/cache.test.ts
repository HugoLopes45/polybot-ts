import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeClock } from "../../shared/time.js";
import { Cache } from "./index.js";

describe("Cache", () => {
	let clock: FakeClock;

	beforeEach(() => {
		clock = new FakeClock(0);
	});

	const createCache = () => new Cache<string>({ ttl: 60000, maxSize: 100, clock });

	describe("get", () => {
		it("should return undefined for non-existent key", () => {
			const cache = createCache();
			expect(cache.get("missing")).toBeUndefined();
		});

		it("should return cached value", () => {
			const cache = createCache();
			cache.set("key", "value");
			expect(cache.get("key")).toBe("value");
		});

		it("should return undefined for expired entry", () => {
			const cache = createCache();
			cache.set("key", "value");
			clock.advance(60001);
			expect(cache.get("key")).toBeUndefined();
		});
	});

	describe("has", () => {
		it("should return false for non-existent key", () => {
			const cache = createCache();
			expect(cache.has("missing")).toBe(false);
		});

		it("should return true for valid cached value", () => {
			const cache = createCache();
			cache.set("key", "value");
			expect(cache.has("key")).toBe(true);
		});

		it("should return false for expired entry", () => {
			const cache = createCache();
			cache.set("key", "value");
			clock.advance(60001);
			expect(cache.has("key")).toBe(false);
		});

		it("should not track as hit/miss", () => {
			const cache = createCache();
			cache.has("key");
			expect(cache.getStats().hits).toBe(0);
			expect(cache.getStats().misses).toBe(0);
		});
	});

	describe("set", () => {
		it("should store value in cache", () => {
			const cache = createCache();
			cache.set("key", "value");
			expect(cache.get("key")).toBe("value");
		});

		it("should overwrite existing value", () => {
			const cache = createCache();
			cache.set("key", "value1");
			cache.set("key", "value2");
			expect(cache.get("key")).toBe("value2");
		});

		it("should evict LRU when max size reached", () => {
			const cache = new Cache<string>({ ttl: 60000, maxSize: 2, clock });
			cache.set("a", "A");
			cache.set("b", "B");
			cache.set("c", "C");
			expect(cache.get("a")).toBeUndefined();
			expect(cache.get("b")).toBe("B");
			expect(cache.get("c")).toBe("C");
		});
	});

	describe("getOrFetch", () => {
		it("should return cached value without calling fetcher", async () => {
			const cache = createCache();
			cache.set("key", "cached");
			const fetcher = vi.fn().mockResolvedValue("fetched");
			const result = await cache.getOrFetch("key", fetcher);
			expect(result).toBe("cached");
			expect(fetcher).not.toHaveBeenCalled();
		});

		it("should fetch and cache on miss", async () => {
			const cache = createCache();
			const fetcher = vi.fn().mockResolvedValue("fetched");
			const result = await cache.getOrFetch("key", fetcher);
			expect(result).toBe("fetched");
			expect(fetcher).toHaveBeenCalledTimes(1);
			expect(cache.get("key")).toBe("fetched");
		});

		it("should prevent thundering herd - multiple concurrent calls use same fetch", async () => {
			const cache = createCache();
			let fetchCount = 0;
			const fetcher = vi.fn().mockImplementation(async () => {
				fetchCount++;
				await new Promise((resolve) => setTimeout(resolve, 50));
				return "fetched";
			});

			const [result1, result2, result3] = await Promise.all([
				cache.getOrFetch("key", fetcher),
				cache.getOrFetch("key", fetcher),
				cache.getOrFetch("key", fetcher),
			]);

			expect(result1).toBe("fetched");
			expect(result2).toBe("fetched");
			expect(result3).toBe("fetched");
			expect(fetchCount).toBe(1);
		});

		it("should allow different keys to fetch concurrently", async () => {
			const cache = createCache();
			const fetcherA = vi.fn().mockResolvedValue("A");
			const fetcherB = vi.fn().mockResolvedValue("B");

			const [resultA, resultB] = await Promise.all([
				cache.getOrFetch("keyA", fetcherA),
				cache.getOrFetch("keyB", fetcherB),
			]);

			expect(resultA).toBe("A");
			expect(resultB).toBe("B");
		});

		it("should handle fetcher error gracefully", async () => {
			const cache = createCache();
			const fetcher = vi.fn().mockRejectedValue(new Error("fetch error"));

			await expect(cache.getOrFetch("key", fetcher)).rejects.toThrow("fetch error");
		});
	});

	describe("delete", () => {
		it("should remove entry from cache", () => {
			const cache = createCache();
			cache.set("key", "value");
			cache.delete("key");
			expect(cache.get("key")).toBeUndefined();
		});

		it("should return true for existing key", () => {
			const cache = createCache();
			cache.set("key", "value");
			expect(cache.delete("key")).toBe(true);
		});

		it("should return false for non-existent key", () => {
			const cache = createCache();
			expect(cache.delete("missing")).toBe(false);
		});
	});

	describe("clear", () => {
		it("should remove all entries", () => {
			const cache = createCache();
			cache.set("a", "A");
			cache.set("b", "B");
			cache.clear();
			expect(cache.get("a")).toBeUndefined();
			expect(cache.get("b")).toBeUndefined();
		});
	});

	describe("getStats", () => {
		it("should track hits and misses", () => {
			const cache = createCache();
			cache.set("key", "value");
			cache.get("key");
			cache.get("missing");
			const stats = cache.getStats();
			expect(stats.hits).toBe(1);
			expect(stats.misses).toBe(1);
			expect(stats.hitRate).toBe(0.5);
		});

		it("should return 0 hit rate when no operations", () => {
			const cache = createCache();
			const stats = cache.getStats();
			expect(stats.hitRate).toBe(0);
		});
	});

	describe("LRU eviction optimization", () => {
		it("should evict correct LRU entry when accessed out of order", () => {
			const cache = new Cache<string>({ ttl: 60000, maxSize: 3, clock });
			cache.set("a", "A");
			cache.set("b", "B");
			cache.set("c", "C");
			cache.get("a");
			cache.set("d", "D");
			expect(cache.get("a")).toBe("A");
			expect(cache.get("b")).toBeUndefined();
			expect(cache.get("c")).toBe("C");
			expect(cache.get("d")).toBe("D");
		});

		it("should evict correct LRU entry when updating existing key", () => {
			const cache = new Cache<string>({ ttl: 60000, maxSize: 3, clock });
			cache.set("a", "A");
			cache.set("b", "B");
			cache.set("a", "A-updated");
			cache.set("c", "C");
			cache.set("d", "D");
			expect(cache.get("a")).toBe("A-updated");
			expect(cache.get("b")).toBeUndefined();
			expect(cache.get("c")).toBe("C");
			expect(cache.get("d")).toBe("D");
		});

		it("should evict oldest when multiple items have same lastAccess", () => {
			const cache = new Cache<string>({ ttl: 60000, maxSize: 2, clock });
			cache.set("a", "A");
			cache.set("b", "B");
			cache.get("a");
			cache.get("b");
			cache.set("a", "A2");
			cache.set("c", "C");
			expect(cache.get("a")).toBe("A2");
			expect(cache.get("b")).toBeUndefined();
			expect(cache.get("c")).toBe("C");
		});
	});
});
