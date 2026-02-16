import { describe, expect, it } from "vitest";
import { Decimal } from "../../shared/decimal.js";
import type { GuardContext } from "../types.js";
import { LatencySlaGuard, type LatencyStats } from "./latency-sla.js";

function mockGuardContext(): GuardContext {
	return {
		conditionId: "test-condition",
		nowMs: () => 1000,
		spot: () => null,
		oraclePrice: () => null,
		bestBid: () => null,
		bestAsk: () => null,
		spread: () => null,
		spreadPct: () => null,
		timeRemainingMs: () => 0,
		openPositionCount: () => 0,
		totalExposure: () => Decimal.zero(),
		availableBalance: () => Decimal.zero(),
		dailyPnl: () => Decimal.zero(),
		consecutiveLosses: () => 0,
		hasPendingOrderFor: () => false,
		lastTradeTimeMs: () => null,
		oracleAgeMs: () => null,
		bookAgeMs: () => null,
	};
}

describe("LatencySlaGuard", () => {
	describe("p95 threshold", () => {
		it("blocks when p95 exceeds threshold", () => {
			const stats: LatencyStats = { p50Ms: 100, p95Ms: 600, p99Ms: 800 };
			const guard = LatencySlaGuard.create(() => stats, { maxP95Ms: 500 });
			const ctx = mockGuardContext();

			const verdict = guard.check(ctx);

			expect(verdict.type).toBe("block");
			if (verdict.type === "block") {
				expect(verdict.guard).toBe("LatencySla");
				expect(verdict.reason).toContain("p95");
				expect(verdict.currentValue).toBe(600);
				expect(verdict.threshold).toBe(500);
			}
		});

		it("allows when p95 is below threshold", () => {
			const stats: LatencyStats = { p50Ms: 100, p95Ms: 400, p99Ms: 800 };
			const guard = LatencySlaGuard.create(() => stats, { maxP95Ms: 500 });
			const ctx = mockGuardContext();

			const verdict = guard.check(ctx);

			expect(verdict.type).toBe("allow");
		});

		it("uses default 500ms threshold when not specified", () => {
			const stats: LatencyStats = { p50Ms: 100, p95Ms: 600, p99Ms: 800 };
			const guard = LatencySlaGuard.create(() => stats);
			const ctx = mockGuardContext();

			const verdict = guard.check(ctx);

			expect(verdict.type).toBe("block");
		});
	});

	describe("p99 threshold", () => {
		it("blocks when p99 exceeds threshold", () => {
			const stats: LatencyStats = { p50Ms: 100, p95Ms: 400, p99Ms: 1100 };
			const guard = LatencySlaGuard.create(() => stats, { maxP99Ms: 1000 });
			const ctx = mockGuardContext();

			const verdict = guard.check(ctx);

			expect(verdict.type).toBe("block");
			if (verdict.type === "block") {
				expect(verdict.guard).toBe("LatencySla");
				expect(verdict.reason).toContain("p99");
				expect(verdict.currentValue).toBe(1100);
				expect(verdict.threshold).toBe(1000);
			}
		});

		it("allows when p99 is below threshold", () => {
			const stats: LatencyStats = { p50Ms: 100, p95Ms: 400, p99Ms: 900 };
			const guard = LatencySlaGuard.create(() => stats, { maxP99Ms: 1000 });
			const ctx = mockGuardContext();

			const verdict = guard.check(ctx);

			expect(verdict.type).toBe("allow");
		});

		it("uses default 1000ms threshold when not specified", () => {
			const stats: LatencyStats = { p50Ms: 100, p95Ms: 400, p99Ms: 1100 };
			const guard = LatencySlaGuard.create(() => stats);
			const ctx = mockGuardContext();

			const verdict = guard.check(ctx);

			expect(verdict.type).toBe("block");
		});
	});

	describe("combined checks", () => {
		it("allows when both p95 and p99 are within bounds", () => {
			const stats: LatencyStats = { p50Ms: 100, p95Ms: 400, p99Ms: 900 };
			const guard = LatencySlaGuard.create(() => stats);
			const ctx = mockGuardContext();

			const verdict = guard.check(ctx);

			expect(verdict.type).toBe("allow");
		});

		it("blocks on p95 first if both violated", () => {
			const stats: LatencyStats = { p50Ms: 100, p95Ms: 600, p99Ms: 1100 };
			const guard = LatencySlaGuard.create(() => stats);
			const ctx = mockGuardContext();

			const verdict = guard.check(ctx);

			expect(verdict.type).toBe("block");
			if (verdict.type === "block") {
				expect(verdict.reason).toContain("p95");
			}
		});
	});
});
