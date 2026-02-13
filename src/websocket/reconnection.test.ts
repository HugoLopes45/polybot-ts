import { type MockInstance, describe, expect, it, vi } from "vitest";
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

	describe("jitter", () => {
		let randomSpy: MockInstance;

		it("applies positive jitter when Math.random returns 1", () => {
			randomSpy = vi.spyOn(Math, "random").mockReturnValue(1);
			const jitterFactor = 0.25;
			const policy = createPolicy(100, 1600, 5, jitterFactor);

			// capped = 100, jitter = 100 * 0.25 * (1*2-1) = 100*0.25*1 = 25
			// result = round(100 + 25) = 125
			const delay = policy.nextDelay();
			expect(delay).toBe(125);

			randomSpy.mockRestore();
		});

		it("applies negative jitter when Math.random returns 0", () => {
			randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
			const jitterFactor = 0.25;
			const policy = createPolicy(100, 1600, 5, jitterFactor);

			// capped = 100, jitter = 100 * 0.25 * (0*2-1) = 100*0.25*(-1) = -25
			// result = max(0, round(100 - 25)) = 75
			const delay = policy.nextDelay();
			expect(delay).toBe(75);

			randomSpy.mockRestore();
		});

		it("delay stays within jitter bounds", () => {
			randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
			const jitterFactor = 0.3;
			const policy = createPolicy(200, 1600, 5, jitterFactor);

			// capped = 200, jitter = 200 * 0.3 * (0.5*2-1) = 200*0.3*0 = 0
			// result = round(200 + 0) = 200
			const delay = policy.nextDelay();
			expect(delay).toBe(200);

			randomSpy.mockRestore();
		});

		it("jitter does not produce negative delays", () => {
			// Use a very high jitter factor
			randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
			const jitterFactor = 0.99;
			const policy = createPolicy(10, 1600, 5, jitterFactor);

			// capped = 10, jitter = 10 * 0.99 * (-1) = -9.9
			// result = max(0, round(10 - 9.9)) = max(0, 0) = 0
			const delay = policy.nextDelay();
			expect(delay).toBeGreaterThanOrEqual(0);

			randomSpy.mockRestore();
		});

		it("jitter respects cap and then jitters around capped value", () => {
			randomSpy = vi.spyOn(Math, "random").mockReturnValue(1);
			const jitterFactor = 0.2;
			const policy = createPolicy(100, 150, 5, jitterFactor);

			policy.nextDelay(); // attempt 0: capped = 100
			policy.nextDelay(); // attempt 1: capped = min(200, 150) = 150

			// attempt 2: raw = 400, capped = 150, jitter = 150*0.2*1 = 30
			// result = round(150 + 30) = 180
			const delay = policy.nextDelay();
			expect(delay).toBe(180);

			randomSpy.mockRestore();
		});
	});
});
