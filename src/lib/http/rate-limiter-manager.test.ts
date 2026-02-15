import { describe, expect, it } from "vitest";
import { FakeClock } from "../../shared/time.js";
import { RateLimiterManager } from "./rate-limiter-manager.js";
import { polymarketPresets } from "./rate-limiter-presets.js";

describe("RateLimiterManager", () => {
	function createManager() {
		const clock = new FakeClock(1000);
		const manager = new RateLimiterManager(clock);
		return { manager, clock };
	}

	it("creates limiter on first getOrCreate", () => {
		const { manager } = createManager();
		const limiter = manager.getOrCreate("test", { capacity: 10, refillRate: 1 });
		expect(limiter).toBeDefined();
		expect(limiter.availableTokens()).toBe(10);
	});

	it("getOrCreate returns same instance for same name", () => {
		const { manager } = createManager();
		const first = manager.getOrCreate("test", { capacity: 10, refillRate: 1 });
		const second = manager.getOrCreate("test", { capacity: 99, refillRate: 99 });
		expect(first).toBe(second);
		expect(second.availableTokens()).toBe(10);
	});

	it("get returns undefined for unknown name", () => {
		const { manager } = createManager();
		expect(manager.get("nonexistent")).toBeUndefined();
	});

	it("has returns true for registered and false for unknown", () => {
		const { manager } = createManager();
		manager.getOrCreate("test", { capacity: 5, refillRate: 1 });
		expect(manager.has("test")).toBe(true);
		expect(manager.has("other")).toBe(false);
	});

	it("per-endpoint isolation: exhausting one does not affect another", () => {
		const { manager } = createManager();
		const a = manager.getOrCreate("a", { capacity: 2, refillRate: 1 });
		const b = manager.getOrCreate("b", { capacity: 5, refillRate: 1 });

		a.tryAcquire();
		a.tryAcquire();
		expect(a.tryAcquire()).toBe(false);
		expect(b.availableTokens()).toBe(5);
	});

	it("tracks hits and misses via getStats", () => {
		const { manager } = createManager();
		const limiter = manager.getOrCreate("test", { capacity: 2, refillRate: 0 });

		limiter.tryAcquire();
		limiter.tryAcquire();
		limiter.tryAcquire();

		const stats = limiter.getStats();
		expect(stats.hits).toBe(2);
		expect(stats.misses).toBe(1);
	});

	it("resetAll clears all stats", () => {
		const { manager } = createManager();
		const a = manager.getOrCreate("a", { capacity: 2, refillRate: 0 });
		const b = manager.getOrCreate("b", { capacity: 1, refillRate: 0 });

		a.tryAcquire();
		b.tryAcquire();
		b.tryAcquire();

		manager.resetAll();

		const statsA = a.getStats();
		const statsB = b.getStats();
		expect(statsA.hits).toBe(0);
		expect(statsA.misses).toBe(0);
		expect(statsB.hits).toBe(0);
		expect(statsB.misses).toBe(0);
	});

	it("getAllStats returns stats for all registered limiters", () => {
		const { manager } = createManager();
		const a = manager.getOrCreate("a", { capacity: 3, refillRate: 0 });
		const b = manager.getOrCreate("b", { capacity: 1, refillRate: 0 });

		a.tryAcquire();
		a.tryAcquire();
		b.tryAcquire();
		b.tryAcquire();

		const allStats = manager.getAllStats();
		expect(allStats.size).toBe(2);

		const statsA = allStats.get("a");
		expect(statsA?.hits).toBe(2);
		expect(statsA?.misses).toBe(0);

		const statsB = allStats.get("b");
		expect(statsB?.hits).toBe(1);
		expect(statsB?.misses).toBe(1);
	});

	it("tracks waits and avgWaitMs", async () => {
		const { manager, clock } = createManager();
		const limiter = manager.getOrCreate("test", { capacity: 1, refillRate: 1 });

		// Exhaust tokens
		limiter.tryAcquire();

		// Start wait — advance clock so token refills
		const waitPromise = limiter.waitForToken();
		clock.advance(1000);
		await waitPromise;

		const stats = limiter.getStats();
		expect(stats.waits).toBe(1);
		expect(stats.avgWaitMs).toBeGreaterThan(0);
	});
});

describe("polymarketPresets", () => {
	it("creates 3 named limiters: general, order, data", () => {
		const clock = new FakeClock(1000);
		const manager = polymarketPresets(clock);

		expect(manager.has("general")).toBe(true);
		expect(manager.has("order")).toBe(true);
		expect(manager.has("data")).toBe(true);
	});

	it("preset capacities match spec (100, 30, 200)", () => {
		const clock = new FakeClock(1000);
		const manager = polymarketPresets(clock);

		const general = manager.get("general");
		const order = manager.get("order");
		const data = manager.get("data");

		expect(general?.availableTokens()).toBe(100);
		expect(order?.availableTokens()).toBe(30);
		expect(data?.availableTokens()).toBe(200);
	});
});
