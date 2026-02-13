import { describe, expect, it, vi } from "vitest";
import { FakeClock } from "../../shared/time.js";
import { Cache } from "./index.js";

describe("Cache", () => {
	describe("get", () => {
		it("returns undefined for missing key", () => {
			const cache = new Cache<string>({ ttl: 1000, maxSize: 10 });
			expect(cache.get("missing")).toBeUndefined();
		});

		it("returns value for existing key", () => {
			const cache = new Cache<string>({ ttl: 1000, maxSize: 10 });
			cache.set("key", "value");
			expect(cache.get("key")).toBe("value");
		});

		it("returns undefined after TTL expires", () => {
			const clock = new FakeClock(1000);
			const cache = new Cache<string>({ ttl: 50, maxSize: 10, clock });
			cache.set("key", "value");
			expect(cache.get("key")).toBe("value");

			clock.advance(51);
			expect(cache.get("key")).toBeUndefined();
		});
	});

	describe("set", () => {
		it("stores value with default TTL", () => {
			const cache = new Cache<string>({ ttl: 1000, maxSize: 10 });
			cache.set("key", "value");
			expect(cache.get("key")).toBe("value");
		});

		it("stores value with custom TTL", () => {
			const cache = new Cache<string>({ ttl: 1000, maxSize: 10 });
			cache.set("key", "value", 100);
			expect(cache.get("key")).toBe("value");
		});

		it("evicts oldest entry when maxSize exceeded", () => {
			const cache = new Cache<string>({ ttl: 1000, maxSize: 2 });
			cache.set("key1", "value1");
			cache.set("key2", "value2");
			cache.set("key3", "value3");

			expect(cache.get("key1")).toBeUndefined();
			expect(cache.get("key2")).toBe("value2");
			expect(cache.get("key3")).toBe("value3");
		});

		it("updates existing key without eviction", () => {
			const cache = new Cache<string>({ ttl: 1000, maxSize: 2 });
			cache.set("key1", "value1");
			cache.set("key2", "value2");
			cache.set("key1", "newValue");

			expect(cache.get("key1")).toBe("newValue");
			expect(cache.get("key2")).toBe("value2");
		});
	});

	describe("getOrFetch", () => {
		it("returns cached value without calling fetcher", async () => {
			const cache = new Cache<string>({ ttl: 1000, maxSize: 10 });
			const fetcher = vi.fn().mockResolvedValue("fetched");

			cache.set("key", "cached");
			const result = await cache.getOrFetch("key", fetcher);

			expect(result).toBe("cached");
			expect(fetcher).not.toHaveBeenCalled();
		});

		it("calls fetcher and caches result on cache miss", async () => {
			const cache = new Cache<string>({ ttl: 1000, maxSize: 10 });
			const fetcher = vi.fn().mockResolvedValue("fetched");

			const result = await cache.getOrFetch("key", fetcher);

			expect(result).toBe("fetched");
			expect(fetcher).toHaveBeenCalledTimes(1);
			expect(cache.get("key")).toBe("fetched");
		});
	});

	describe("delete", () => {
		it("removes entry from cache", () => {
			const cache = new Cache<string>({ ttl: 1000, maxSize: 10 });
			cache.set("key", "value");
			cache.delete("key");

			expect(cache.get("key")).toBeUndefined();
		});

		it("returns true for existing key", () => {
			const cache = new Cache<string>({ ttl: 1000, maxSize: 10 });
			cache.set("key", "value");

			expect(cache.delete("key")).toBe(true);
		});

		it("returns false for missing key", () => {
			const cache = new Cache<string>({ ttl: 1000, maxSize: 10 });
			expect(cache.delete("missing")).toBe(false);
		});
	});

	describe("clear", () => {
		it("removes all entries", () => {
			const cache = new Cache<string>({ ttl: 1000, maxSize: 10 });
			cache.set("key1", "value1");
			cache.set("key2", "value2");
			cache.clear();

			expect(cache.get("key1")).toBeUndefined();
			expect(cache.get("key2")).toBeUndefined();
		});
	});

	describe("stats", () => {
		it("tracks hits and misses", () => {
			const cache = new Cache<string>({ ttl: 1000, maxSize: 10 });
			cache.set("key", "value");

			cache.get("key");
			cache.get("missing");

			const stats = cache.getStats();
			expect(stats.hits).toBe(1);
			expect(stats.misses).toBe(1);
			expect(stats.hitRate).toBe(0.5);
		});
	});
});
