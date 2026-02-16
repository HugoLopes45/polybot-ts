import { describe, expect, it } from "vitest";
import { FakeClock } from "../shared/time.js";
import { IdempotencyGuard } from "./idempotency-guard.js";

describe("IdempotencyGuard", () => {
	it("allows first submission", () => {
		const clock = new FakeClock(1000);
		const guard = IdempotencyGuard.create({ ttlMs: 5000 }, clock);
		expect(guard.isDuplicate("token1", "buy", "0.50", "100")).toBe(false);
	});

	it("rejects duplicate submission", () => {
		const clock = new FakeClock(1000);
		const guard = IdempotencyGuard.create({ ttlMs: 5000 }, clock);
		guard.isDuplicate("token1", "buy", "0.50", "100");
		expect(guard.isDuplicate("token1", "buy", "0.50", "100")).toBe(true);
	});

	it("allows same token with different side", () => {
		const clock = new FakeClock(1000);
		const guard = IdempotencyGuard.create({ ttlMs: 5000 }, clock);
		guard.isDuplicate("token1", "buy", "0.50", "100");
		expect(guard.isDuplicate("token1", "sell", "0.50", "100")).toBe(false);
	});

	it("allows same token with different price", () => {
		const clock = new FakeClock(1000);
		const guard = IdempotencyGuard.create({ ttlMs: 5000 }, clock);
		guard.isDuplicate("token1", "buy", "0.50", "100");
		expect(guard.isDuplicate("token1", "buy", "0.55", "100")).toBe(false);
	});

	it("expires entries after TTL", () => {
		const clock = new FakeClock(1000);
		const guard = IdempotencyGuard.create({ ttlMs: 5000 }, clock);
		guard.isDuplicate("token1", "buy", "0.50", "100");
		clock.advance(6000);
		expect(guard.isDuplicate("token1", "buy", "0.50", "100")).toBe(false);
	});

	it("tracks size correctly", () => {
		const clock = new FakeClock(1000);
		const guard = IdempotencyGuard.create({ ttlMs: 5000 }, clock);
		guard.isDuplicate("t1", "buy", "0.50", "100");
		guard.isDuplicate("t2", "sell", "0.60", "200");
		expect(guard.size).toBe(2);
	});

	it("evicts expired entries from size count", () => {
		const clock = new FakeClock(1000);
		const guard = IdempotencyGuard.create({ ttlMs: 5000 }, clock);
		guard.isDuplicate("t1", "buy", "0.50", "100");
		clock.advance(6000);
		expect(guard.size).toBe(0);
	});

	it("clears all entries", () => {
		const clock = new FakeClock(1000);
		const guard = IdempotencyGuard.create({ ttlMs: 5000 }, clock);
		guard.isDuplicate("t1", "buy", "0.50", "100");
		guard.isDuplicate("t2", "sell", "0.60", "200");
		guard.clear();
		expect(guard.size).toBe(0);
		expect(guard.isDuplicate("t1", "buy", "0.50", "100")).toBe(false);
	});
});
