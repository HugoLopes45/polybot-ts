import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { FakeClock } from "../shared/time.js";
import { DashboardRenderer } from "./renderer.js";
import { TerminalDashboard } from "./terminal-dashboard.js";
import type { DashboardStats } from "./types.js";

function makeStats(overrides?: Partial<DashboardStats>): DashboardStats {
	return {
		uptimeMs: 0,
		positions: [],
		recentTrades: [],
		alerts: [],
		portfolioValue: Decimal.from(1000),
		dailyPnl: Decimal.zero(),
		winRate: 0,
		tickLatencyP50Ms: 0,
		tickLatencyP99Ms: 0,
		...overrides,
	};
}

describe("TerminalDashboard", () => {
	let clock: FakeClock;
	let mockOutput: { write: ReturnType<typeof vi.fn> };

	beforeEach(() => {
		vi.useFakeTimers();
		clock = new FakeClock(1700000000000);
		mockOutput = { write: vi.fn() };
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("start() sets timer and render calls output.write", () => {
		const dash = new TerminalDashboard({ clock, refreshIntervalMs: 500 }, mockOutput);
		dash.start();

		vi.advanceTimersByTime(500);
		expect(mockOutput.write).toHaveBeenCalled();
	});

	it("stop() clears timer and writes clear screen", () => {
		const dash = new TerminalDashboard({ clock, refreshIntervalMs: 500 }, mockOutput);
		dash.start();
		dash.stop();

		expect(mockOutput.write).toHaveBeenCalledWith("\x1b[2J\x1b[H");

		mockOutput.write.mockClear();
		vi.advanceTimersByTime(1000);
		expect(mockOutput.write).not.toHaveBeenCalled();
	});

	it("update() stores stats that appear in render output", () => {
		const dash = new TerminalDashboard({ clock, refreshIntervalMs: 100 }, mockOutput);
		dash.update(makeStats({ portfolioValue: Decimal.from(9999.99) }));
		dash.start();

		vi.advanceTimersByTime(100);

		const rendered = mockOutput.write.mock.calls[0]?.[0] as string;
		expect(rendered).toContain("9999.99");
	});

	it("pushAlert() adds alerts respecting maxAlerts", () => {
		const dash = new TerminalDashboard({ clock, refreshIntervalMs: 100, maxAlerts: 3 }, mockOutput);

		dash.pushAlert("first", "info");
		dash.pushAlert("second", "warn");
		dash.pushAlert("third", "error");
		dash.pushAlert("fourth", "info");

		dash.start();
		vi.advanceTimersByTime(100);

		const rendered = mockOutput.write.mock.calls[0]?.[0] as string;
		expect(rendered).not.toContain("first");
		expect(rendered).toContain("second");
		expect(rendered).toContain("third");
		expect(rendered).toContain("fourth");
	});

	it("start() is idempotent — calling twice does not create two timers", () => {
		const dash = new TerminalDashboard({ clock, refreshIntervalMs: 200 }, mockOutput);
		dash.start();
		dash.start();

		vi.advanceTimersByTime(200);
		expect(mockOutput.write).toHaveBeenCalledTimes(1);
	});

	it("stop() writes clear screen escape code", () => {
		const dash = new TerminalDashboard({ clock }, mockOutput);
		dash.stop();

		expect(mockOutput.write).toHaveBeenCalledWith("\x1b[2J\x1b[H");
	});

	it("render includes computed uptime from clock", () => {
		const dash = new TerminalDashboard({ clock, refreshIntervalMs: 100 }, mockOutput);

		clock.advance(60000);
		dash.start();
		vi.advanceTimersByTime(100);

		const rendered = mockOutput.write.mock.calls[0]?.[0] as string;
		expect(rendered).toContain("1m");
	});

	it("defaults to maxAlerts of 10", () => {
		const dash = new TerminalDashboard({ clock, refreshIntervalMs: 100 }, mockOutput);

		for (let i = 0; i < 15; i++) {
			dash.pushAlert(`alert-${i}`, "info");
		}

		dash.start();
		vi.advanceTimersByTime(100);

		const rendered = mockOutput.write.mock.calls[0]?.[0] as string;
		expect(rendered).not.toContain("alert-0");
		expect(rendered).not.toContain("alert-4");
		expect(rendered).toContain("alert-5");
		expect(rendered).toContain("alert-14");
	});

	it("constructor throws when refreshIntervalMs <= 0", () => {
		expect(() => new TerminalDashboard({ clock, refreshIntervalMs: 0 }, mockOutput)).toThrow(
			"refreshIntervalMs must be > 0",
		);
		expect(() => new TerminalDashboard({ clock, refreshIntervalMs: -1 }, mockOutput)).toThrow(
			"refreshIntervalMs must be > 0",
		);
	});

	it("constructor throws when maxAlerts < 0", () => {
		expect(() => new TerminalDashboard({ clock, maxAlerts: -1 }, mockOutput)).toThrow(
			"maxAlerts must be >= 0",
		);
	});

	it("render() error is caught and pushed as alert, does not crash interval", () => {
		const dash = new TerminalDashboard({ clock, refreshIntervalMs: 100 }, mockOutput);
		dash.start();

		const renderSpy = vi.spyOn(DashboardRenderer, "render").mockImplementation(() => {
			throw new Error("renderer boom");
		});

		vi.advanceTimersByTime(100);

		// Dashboard should still be alive — next tick should also fire
		renderSpy.mockRestore();
		vi.advanceTimersByTime(100);

		// The second render should succeed and output should contain the alert
		const lastCall = mockOutput.write.mock.calls[mockOutput.write.mock.calls.length - 1];
		const rendered = lastCall?.[0] as string;
		expect(rendered).toContain("Render error: renderer boom");

		dash.stop();
	});
});
