import { describe, expect, it } from "vitest";
import { Duration, FakeClock, SystemClock } from "./time.js";

describe("Clock", () => {
	describe("SystemClock", () => {
		it("returns current time", () => {
			const before = Date.now();
			const now = SystemClock.now();
			const after = Date.now();
			expect(now).toBeGreaterThanOrEqual(before);
			expect(now).toBeLessThanOrEqual(after);
		});
	});

	describe("FakeClock", () => {
		it("starts at given time", () => {
			const clock = new FakeClock(1000);
			expect(clock.now()).toBe(1000);
		});

		it("starts at 0 by default", () => {
			const clock = new FakeClock();
			expect(clock.now()).toBe(0);
		});

		it("advance increments time", () => {
			const clock = new FakeClock(100);
			clock.advance(50);
			expect(clock.now()).toBe(150);
			clock.advance(25);
			expect(clock.now()).toBe(175);
		});

		it("set overrides time", () => {
			const clock = new FakeClock(100);
			clock.set(9999);
			expect(clock.now()).toBe(9999);
		});

		it("advance(0) is a no-op (HARD-4)", () => {
			const clock = new FakeClock(100);
			clock.advance(0);
			expect(clock.now()).toBe(100);
		});

		it("advance with negative value throws with value in message (HARD-4)", () => {
			const clock = new FakeClock(100);
			expect(() => clock.advance(-1)).toThrow("non-negative ms, got -1");
			expect(() => clock.advance(-42)).toThrow("got -42");
		});
	});
});

describe("Duration", () => {
	it("converts units to milliseconds", () => {
		expect(Duration.ms(100)).toBe(100);
		expect(Duration.seconds(1)).toBe(1_000);
		expect(Duration.minutes(1)).toBe(60_000);
		expect(Duration.hours(1)).toBe(3_600_000);
	});
});
