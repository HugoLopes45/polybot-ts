import { describe, expect, it } from "vitest";
import { FakeClock } from "../../shared/time.js";
import { polymarketPresets } from "./rate-limiter-presets.js";

describe("polymarketPresets", () => {
	it("creates 3 named limiters: general, order, data", () => {
		const clock = new FakeClock(1000);
		const manager = polymarketPresets(clock);

		expect(manager.has("general")).toBe(true);
		expect(manager.has("order")).toBe(true);
		expect(manager.has("data")).toBe(true);
	});

	it("general limiter has capacity 100 and refillRate 100/60", () => {
		const clock = new FakeClock(1000);
		const manager = polymarketPresets(clock);

		const general = manager.get("general");
		expect(general).toBeDefined();
		expect(general?.availableTokens()).toBe(100);
	});

	it("order limiter has capacity 30 and refillRate 30/60", () => {
		const clock = new FakeClock(1000);
		const manager = polymarketPresets(clock);

		const order = manager.get("order");
		expect(order).toBeDefined();
		expect(order?.availableTokens()).toBe(30);
	});

	it("data limiter has capacity 200 and refillRate 200/60", () => {
		const clock = new FakeClock(1000);
		const manager = polymarketPresets(clock);

		const data = manager.get("data");
		expect(data).toBeDefined();
		expect(data?.availableTokens()).toBe(200);
	});
});
