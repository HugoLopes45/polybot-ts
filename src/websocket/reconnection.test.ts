import { describe, expect, it } from "vitest";
import { ReconnectionPolicy } from "./reconnection.js";

describe("ReconnectionPolicy", () => {
	function createPolicy(baseDelayMs = 100, maxDelayMs = 1600, maxAttempts = 5, jitterFactor = 0) {
		return new ReconnectionPolicy({ baseDelayMs, maxDelayMs, maxAttempts, jitterFactor });
	}

	it("returns baseDelay on first call", () => {
		const policy = createPolicy();
		expect(policy.nextDelay()).toBe(100);
	});

	it("doubles delay on subsequent calls", () => {
		const policy = createPolicy();
		policy.nextDelay(); // 100
		expect(policy.nextDelay()).toBe(200);
		expect(policy.nextDelay()).toBe(400);
	});

	it("caps delay at maxDelay", () => {
		const policy = createPolicy(100, 300);
		policy.nextDelay(); // 100
		policy.nextDelay(); // 200
		expect(policy.nextDelay()).toBe(300);
		expect(policy.nextDelay()).toBe(300);
	});

	it("resets delay back to base", () => {
		const policy = createPolicy();
		policy.nextDelay(); // 100
		policy.nextDelay(); // 200
		policy.reset();
		expect(policy.nextDelay()).toBe(100);
	});

	it("shouldRetry returns false after maxAttempts", () => {
		const policy = createPolicy(100, 1600, 3);
		expect(policy.shouldRetry()).toBe(true);
		policy.nextDelay();
		expect(policy.shouldRetry()).toBe(true);
		policy.nextDelay();
		expect(policy.shouldRetry()).toBe(true);
		policy.nextDelay();
		expect(policy.shouldRetry()).toBe(false);
	});
});
