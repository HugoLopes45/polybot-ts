import { describe, expect, it } from "vitest";
import { Decimal } from "../../shared/decimal.js";
import type { GuardContext } from "../types.js";
import { StatsGuard, type StatsSnapshot } from "./stats.js";

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

describe("StatsGuard", () => {
	describe("drawdown threshold", () => {
		it("blocks when drawdown exceeds threshold", () => {
			const stats: StatsSnapshot = {
				drawdownPct: 0.25,
				consecutiveLosses: 0,
				winRate: 0.5,
				tradeCount: 50,
			};
			const guard = StatsGuard.create(() => stats, { maxDrawdownPct: 0.2 });
			const ctx = mockGuardContext();

			const verdict = guard.check(ctx);

			expect(verdict.type).toBe("block");
			if (verdict.type === "block") {
				expect(verdict.guard).toBe("Stats");
				expect(verdict.reason).toContain("drawdown");
				expect(verdict.currentValue).toBe(25);
				expect(verdict.threshold).toBe(20);
			}
		});

		it("allows when drawdown is below threshold", () => {
			const stats: StatsSnapshot = {
				drawdownPct: 0.15,
				consecutiveLosses: 0,
				winRate: 0.5,
				tradeCount: 50,
			};
			const guard = StatsGuard.create(() => stats, { maxDrawdownPct: 0.2 });
			const ctx = mockGuardContext();

			const verdict = guard.check(ctx);

			expect(verdict.type).toBe("allow");
		});

		it("uses default 20% threshold when not specified", () => {
			const stats: StatsSnapshot = {
				drawdownPct: 0.21,
				consecutiveLosses: 0,
				winRate: 0.5,
				tradeCount: 50,
			};
			const guard = StatsGuard.create(() => stats);
			const ctx = mockGuardContext();

			const verdict = guard.check(ctx);

			expect(verdict.type).toBe("block");
		});
	});

	describe("consecutive losses", () => {
		it("blocks when consecutive losses exceed threshold", () => {
			const stats: StatsSnapshot = {
				drawdownPct: 0.1,
				consecutiveLosses: 6,
				winRate: 0.5,
				tradeCount: 50,
			};
			const guard = StatsGuard.create(() => stats, { maxConsecutiveLosses: 5 });
			const ctx = mockGuardContext();

			const verdict = guard.check(ctx);

			expect(verdict.type).toBe("block");
			if (verdict.type === "block") {
				expect(verdict.guard).toBe("Stats");
				expect(verdict.reason).toContain("consecutive losses");
				expect(verdict.currentValue).toBe(6);
				expect(verdict.threshold).toBe(5);
			}
		});

		it("allows when consecutive losses are below threshold", () => {
			const stats: StatsSnapshot = {
				drawdownPct: 0.1,
				consecutiveLosses: 4,
				winRate: 0.5,
				tradeCount: 50,
			};
			const guard = StatsGuard.create(() => stats, { maxConsecutiveLosses: 5 });
			const ctx = mockGuardContext();

			const verdict = guard.check(ctx);

			expect(verdict.type).toBe("allow");
		});

		it("uses default 5 threshold when not specified", () => {
			const stats: StatsSnapshot = {
				drawdownPct: 0.1,
				consecutiveLosses: 6,
				winRate: 0.5,
				tradeCount: 50,
			};
			const guard = StatsGuard.create(() => stats);
			const ctx = mockGuardContext();

			const verdict = guard.check(ctx);

			expect(verdict.type).toBe("block");
		});
	});

	describe("win rate", () => {
		it("blocks when win rate is below threshold with sufficient trades", () => {
			const stats: StatsSnapshot = {
				drawdownPct: 0.1,
				consecutiveLosses: 0,
				winRate: 0.35,
				tradeCount: 30,
			};
			const guard = StatsGuard.create(() => stats, { minWinRate: 0.4, minTradesForWinRate: 20 });
			const ctx = mockGuardContext();

			const verdict = guard.check(ctx);

			expect(verdict.type).toBe("block");
			if (verdict.type === "block") {
				expect(verdict.guard).toBe("Stats");
				expect(verdict.reason).toContain("win rate");
				expect(verdict.currentValue).toBe(35);
				expect(verdict.threshold).toBe(40);
			}
		});

		it("allows when win rate is above threshold", () => {
			const stats: StatsSnapshot = {
				drawdownPct: 0.1,
				consecutiveLosses: 0,
				winRate: 0.45,
				tradeCount: 30,
			};
			const guard = StatsGuard.create(() => stats, { minWinRate: 0.4, minTradesForWinRate: 20 });
			const ctx = mockGuardContext();

			const verdict = guard.check(ctx);

			expect(verdict.type).toBe("allow");
		});

		it("ignores win rate when trade count is below minimum", () => {
			const stats: StatsSnapshot = {
				drawdownPct: 0.1,
				consecutiveLosses: 0,
				winRate: 0.2,
				tradeCount: 15,
			};
			const guard = StatsGuard.create(() => stats, { minWinRate: 0.4, minTradesForWinRate: 20 });
			const ctx = mockGuardContext();

			const verdict = guard.check(ctx);

			expect(verdict.type).toBe("allow");
		});

		it("uses default thresholds when not specified", () => {
			const stats: StatsSnapshot = {
				drawdownPct: 0.1,
				consecutiveLosses: 0,
				winRate: 0.35,
				tradeCount: 25,
			};
			const guard = StatsGuard.create(() => stats);
			const ctx = mockGuardContext();

			const verdict = guard.check(ctx);

			expect(verdict.type).toBe("block");
		});
	});

	describe("combined checks", () => {
		it("allows when all metrics are within bounds", () => {
			const stats: StatsSnapshot = {
				drawdownPct: 0.15,
				consecutiveLosses: 3,
				winRate: 0.5,
				tradeCount: 40,
			};
			const guard = StatsGuard.create(() => stats);
			const ctx = mockGuardContext();

			const verdict = guard.check(ctx);

			expect(verdict.type).toBe("allow");
		});

		it("blocks on first violation in order of checks", () => {
			const stats: StatsSnapshot = {
				drawdownPct: 0.25,
				consecutiveLosses: 6,
				winRate: 0.3,
				tradeCount: 50,
			};
			const guard = StatsGuard.create(() => stats);
			const ctx = mockGuardContext();

			const verdict = guard.check(ctx);

			expect(verdict.type).toBe("block");
			if (verdict.type === "block") {
				expect(verdict.reason).toContain("drawdown");
			}
		});
	});
});
