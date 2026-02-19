import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { conditionId } from "../shared/identifiers.js";
import { GREEN, RED } from "./ansi.js";
import { DashboardRenderer } from "./renderer.js";
import type { DashboardStats } from "./types.js";

function makeStats(overrides?: Partial<DashboardStats>): DashboardStats {
	return {
		uptimeMs: 3661000,
		positions: [
			{
				conditionId: conditionId("0xabc123def456"),
				side: "BUY" as const,
				size: Decimal.from(100),
				entryPrice: Decimal.from(0.65),
				unrealizedPnl: Decimal.from(12.5),
			},
		],
		recentTrades: [
			{
				conditionId: conditionId("0xabc123def456"),
				side: "BUY" as const,
				price: Decimal.from(0.65),
				size: Decimal.from(50),
				timestamp: 1700000000000,
			},
		],
		alerts: [
			{ message: "Connection restored", level: "info" as const, timestamp: 1700000000000 },
			{ message: "High latency detected", level: "warn" as const, timestamp: 1700000001000 },
			{ message: "Order rejected", level: "error" as const, timestamp: 1700000002000 },
		],
		portfolioValue: Decimal.from(1234.56),
		dailyPnl: Decimal.from(42.0),
		winRate: 0.65,
		tickLatencyP50Ms: 1.2,
		tickLatencyP99Ms: 15.7,
		...overrides,
	};
}

describe("DashboardRenderer", () => {
	it("output contains POLYBOT DASHBOARD header", () => {
		const output = DashboardRenderer.render(makeStats(), 1700000000000);
		expect(output).toContain("POLYBOT DASHBOARD");
	});

	it("output contains portfolio value formatted correctly", () => {
		const output = DashboardRenderer.render(makeStats(), 1700000000000);
		expect(output).toContain("$1234.56");
	});

	it("output contains latency section", () => {
		const output = DashboardRenderer.render(makeStats(), 1700000000000);
		expect(output).toContain("Latency p50: 1.2ms");
		expect(output).toContain("p99: 15.7ms");
	});

	it("output contains alert messages", () => {
		const output = DashboardRenderer.render(makeStats(), 1700000000000);
		expect(output).toContain("Connection restored");
		expect(output).toContain("High latency detected");
		expect(output).toContain("Order rejected");
	});

	it("output contains position rows", () => {
		const output = DashboardRenderer.render(makeStats(), 1700000000000);
		expect(output).toContain("0xabc123def45");
		expect(output).toContain("BUY");
		expect(output).toContain("100.00");
	});

	it("positive dailyPnl uses green color code", () => {
		const output = DashboardRenderer.render(
			makeStats({ dailyPnl: Decimal.from(10) }),
			1700000000000,
		);
		expect(output).toContain(GREEN);
		expect(output).toContain("+$10.00");
	});

	it("negative dailyPnl uses red color code", () => {
		const output = DashboardRenderer.render(
			makeStats({ dailyPnl: Decimal.from(-5.5) }),
			1700000000000,
		);
		expect(output).toContain(RED);
		expect(output).toContain("-$5.50");
	});

	it("shows (none) when no positions", () => {
		const output = DashboardRenderer.render(makeStats({ positions: [] }), 1700000000000);
		expect(output).toContain("(none)");
	});

	it("shows only last 5 trades", () => {
		const trades = Array.from({ length: 8 }, (_, i) => ({
			conditionId: conditionId(`cond-${i}`),
			side: "BUY" as const,
			price: Decimal.from(0.5),
			size: Decimal.from(10),
			timestamp: 1700000000000 + i * 1000,
		}));
		const output = DashboardRenderer.render(makeStats({ recentTrades: trades }), 1700000000000);
		expect(output).not.toContain("cond-0");
		expect(output).not.toContain("cond-2");
		expect(output).toContain("cond-3");
		expect(output).toContain("cond-7");
	});

	it("formats uptime correctly", () => {
		const output = DashboardRenderer.render(makeStats({ uptimeMs: 3661000 }), 1700000000000);
		expect(output).toContain("1h 1m 1s");
	});

	it("formats win rate as percentage", () => {
		const output = DashboardRenderer.render(makeStats({ winRate: 0.75 }), 1700000000000);
		expect(output).toContain("75.0%");
	});

	it("alert levels are shown in uppercase", () => {
		const output = DashboardRenderer.render(makeStats(), 1700000000000);
		expect(output).toContain("[INFO]");
		expect(output).toContain("[WARN]");
		expect(output).toContain("[ERROR]");
	});
});
