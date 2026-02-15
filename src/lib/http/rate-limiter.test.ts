import { describe, expect, it } from "vitest";
import { ConfigError } from "../../shared/errors.js";
import { FakeClock } from "../../shared/time.js";
import { TokenBucketRateLimiter } from "./rate-limiter.js";

describe("TokenBucketRateLimiter", () => {
	function createLimiter(capacity = 5, refillRate = 1) {
		const clock = new FakeClock(1000);
		const limiter = new TokenBucketRateLimiter({ capacity, refillRate, clock });
		return { limiter, clock };
	}

	it("starts with full capacity", () => {
		const { limiter } = createLimiter(5);
		expect(limiter.availableTokens()).toBe(5);
	});

	it("tryAcquire decrements tokens", () => {
		const { limiter } = createLimiter(5);
		limiter.tryAcquire();
		limiter.tryAcquire();
		limiter.tryAcquire();
		expect(limiter.availableTokens()).toBe(2);
	});

	it("tryAcquire returns false when exhausted", () => {
		const { limiter } = createLimiter(3);
		expect(limiter.tryAcquire()).toBe(true);
		expect(limiter.tryAcquire()).toBe(true);
		expect(limiter.tryAcquire()).toBe(true);
		expect(limiter.tryAcquire()).toBe(false);
	});

	it("tokens refill over time", () => {
		const { limiter, clock } = createLimiter(5, 2);
		// Exhaust all tokens
		for (let i = 0; i < 5; i++) limiter.tryAcquire();
		expect(limiter.availableTokens()).toBe(0);

		// Advance 2 seconds at 2 tokens/sec = 4 tokens refilled
		clock.advance(2000);
		expect(limiter.availableTokens()).toBe(4);
	});

	it("refill does not exceed capacity", () => {
		const { limiter, clock } = createLimiter(5, 10);
		// Exhaust all tokens
		for (let i = 0; i < 5; i++) limiter.tryAcquire();

		// Advance 10 seconds at 10 tokens/sec = 100 tokens, but capped at 5
		clock.advance(10_000);
		expect(limiter.availableTokens()).toBe(5);
	});

	it("partial refill floors to integer", () => {
		const { limiter, clock } = createLimiter(5, 1);
		// Exhaust all tokens
		for (let i = 0; i < 5; i++) limiter.tryAcquire();

		// Advance 2500ms at 1 token/sec = 2.5 tokens, floor to 2
		clock.advance(2500);
		expect(limiter.availableTokens()).toBe(2);
	});

	it("waitForToken resolves immediately if tokens available", async () => {
		const { limiter } = createLimiter(5);
		// Should resolve without any clock advancement
		await limiter.waitForToken();
		expect(limiter.availableTokens()).toBe(4);
	});

	it("rejects capacity < 1", () => {
		const clock = new FakeClock(1000);
		expect(() => new TokenBucketRateLimiter({ capacity: 0, refillRate: 1, clock })).toThrow(
			"capacity must be >= 1",
		);
	});

	it("rejects negative capacity", () => {
		const clock = new FakeClock(1000);
		expect(() => new TokenBucketRateLimiter({ capacity: -1, refillRate: 1, clock })).toThrow(
			"capacity must be >= 1",
		);
	});

	it("rejects negative refillRate", () => {
		const clock = new FakeClock(1000);
		expect(() => new TokenBucketRateLimiter({ capacity: 5, refillRate: -1, clock })).toThrow(
			"refillRate must be >= 0",
		);
	});

	it("allows refillRate=0 (valid for non-refilling limiters)", () => {
		const { limiter, clock } = createLimiter(2, 0);
		limiter.tryAcquire();
		limiter.tryAcquire();
		clock.advance(10_000);
		expect(limiter.availableTokens()).toBe(0);
	});

	describe("timeUntilNextTokenMs", () => {
		it("returns 0 when tokens are available", () => {
			const { limiter } = createLimiter(5, 1);
			expect(limiter.timeUntilNextTokenMs()).toBe(0);
		});

		it("returns positive ms when tokens exhausted", () => {
			const { limiter } = createLimiter(1, 1);
			limiter.tryAcquire();
			const ms = limiter.timeUntilNextTokenMs();
			expect(ms).toBeGreaterThan(0);
			expect(ms).toBeLessThanOrEqual(1000);
		});

		it("returns Infinity when refillRate is 0 and tokens exhausted", () => {
			const { limiter } = createLimiter(1, 0);
			limiter.tryAcquire();
			expect(limiter.timeUntilNextTokenMs()).toBe(Number.POSITIVE_INFINITY);
		});

		it("returns 0 for refillRate=0 when tokens still available", () => {
			const { limiter } = createLimiter(2, 0);
			expect(limiter.timeUntilNextTokenMs()).toBe(0);
		});

		it("decreases after clock advances", () => {
			const { limiter, clock } = createLimiter(1, 2);
			limiter.tryAcquire();
			const before = limiter.timeUntilNextTokenMs();
			clock.advance(200);
			const after = limiter.timeUntilNextTokenMs();
			expect(after).toBeLessThan(before);
		});
	});

	it("constructor throws ConfigError for invalid capacity", () => {
		const clock = new FakeClock(1000);
		expect(() => new TokenBucketRateLimiter({ capacity: 0, refillRate: 1, clock })).toThrow(
			ConfigError,
		);
	});

	it("constructor throws ConfigError for negative refillRate", () => {
		const clock = new FakeClock(1000);
		expect(() => new TokenBucketRateLimiter({ capacity: 5, refillRate: -1, clock })).toThrow(
			ConfigError,
		);
	});

	it("waitForToken resolves when token becomes available", async () => {
		const { limiter, clock } = createLimiter(2, 1);
		// Exhaust all tokens
		limiter.tryAcquire();
		limiter.tryAcquire();
		expect(limiter.availableTokens()).toBe(0);

		// Start waiting — this should not resolve yet
		let resolved = false;
		const promise = limiter.waitForToken().then(() => {
			resolved = true;
		});

		// Not yet resolved
		await Promise.resolve();
		expect(resolved).toBe(false);

		// Advance clock by 1 second (1 token at 1/sec)
		clock.advance(1000);

		// Allow polling interval to fire and resolve
		await promise;
		expect(resolved).toBe(true);
	});
});
