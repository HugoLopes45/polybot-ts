import { describe, expect, it } from "vitest";
import { Duration, FakeClock } from "../shared/time.js";
import { WatchdogStatus } from "./types.js";
import { ConnectivityWatchdog } from "./watchdog.js";

describe("ConnectivityWatchdog", () => {
	function createWatchdog(warningMs = Duration.seconds(15), criticalMs = Duration.seconds(30)) {
		const clock = new FakeClock(1000);
		const wd = new ConnectivityWatchdog({ warningMs, criticalMs }, clock);
		return { wd, clock };
	}

	describe("healthy state", () => {
		it("starts healthy", () => {
			const { wd } = createWatchdog();
			expect(wd.status()).toBe(WatchdogStatus.Healthy);
		});

		it("stays healthy when touched recently", () => {
			const { wd, clock } = createWatchdog();
			clock.advance(Duration.seconds(10));
			wd.touch();
			clock.advance(Duration.seconds(5));
			expect(wd.status()).toBe(WatchdogStatus.Healthy);
		});

		it("does not block entries when healthy", () => {
			const { wd } = createWatchdog();
			expect(wd.shouldBlockEntries()).toBe(false);
		});
	});

	describe("degraded state", () => {
		it("becomes degraded after warning threshold", () => {
			const { wd, clock } = createWatchdog();
			clock.advance(Duration.seconds(15));
			expect(wd.status()).toBe(WatchdogStatus.Degraded);
		});

		it("blocks entries when degraded", () => {
			const { wd, clock } = createWatchdog();
			clock.advance(Duration.seconds(20));
			expect(wd.shouldBlockEntries()).toBe(true);
		});

		it("recovers to healthy on touch", () => {
			const { wd, clock } = createWatchdog();
			clock.advance(Duration.seconds(20));
			expect(wd.status()).toBe(WatchdogStatus.Degraded);

			wd.touch();
			expect(wd.status()).toBe(WatchdogStatus.Healthy);
		});
	});

	describe("critical state", () => {
		it("becomes critical after critical threshold", () => {
			const { wd, clock } = createWatchdog();
			clock.advance(Duration.seconds(30));
			expect(wd.status()).toBe(WatchdogStatus.Critical);
		});

		it("blocks entries when critical", () => {
			const { wd, clock } = createWatchdog();
			clock.advance(Duration.seconds(45));
			expect(wd.shouldBlockEntries()).toBe(true);
		});
	});

	describe("silenceMs", () => {
		it("reports time since last touch", () => {
			const { wd, clock } = createWatchdog();
			clock.advance(5000);
			expect(wd.silenceMs()).toBe(5000);

			wd.touch();
			expect(wd.silenceMs()).toBe(0);

			clock.advance(2000);
			expect(wd.silenceMs()).toBe(2000);
		});
	});

	describe("clock backward (HARD-3)", () => {
		it("silenceMs handles clock going backward gracefully", () => {
			const { wd, clock } = createWatchdog();
			clock.advance(Duration.seconds(10));
			wd.touch();
			// Set clock backward (before last touch)
			clock.set(500);
			// silenceMs = now - lastTouchMs = 500 - 11000 = negative
			// This should still work without crashing; result may be negative
			const silence = wd.silenceMs();
			expect(typeof silence).toBe("number");
			// Status should be healthy since elapsed is negative (< warning)
			expect(wd.status()).toBe(WatchdogStatus.Healthy);
		});
	});

	describe("custom thresholds", () => {
		it("respects custom warning/critical values", () => {
			const { wd, clock } = createWatchdog(Duration.seconds(5), Duration.seconds(10));

			clock.advance(Duration.seconds(5));
			expect(wd.status()).toBe(WatchdogStatus.Degraded);

			clock.advance(Duration.seconds(5));
			expect(wd.status()).toBe(WatchdogStatus.Critical);
		});
	});
});
