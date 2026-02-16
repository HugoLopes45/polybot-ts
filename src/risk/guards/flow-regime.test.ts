import { describe, expect, it } from "vitest";
import { Decimal } from "../../shared/decimal.js";
import type { GuardContext } from "../types.js";
import { FlowRegimeGuard } from "./flow-regime.js";

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

describe("FlowRegimeGuard", () => {
	describe("VPIN threshold", () => {
		it("blocks when VPIN exceeds threshold", () => {
			const getVpin = () => Decimal.from(0.75);
			const guard = FlowRegimeGuard.create(getVpin, Decimal.from(0.7));
			const ctx = mockGuardContext();

			const verdict = guard.check(ctx);

			expect(verdict.type).toBe("block");
			if (verdict.type === "block") {
				expect(verdict.guard).toBe("FlowRegime");
				expect(verdict.reason).toContain("toxic flow");
				expect(verdict.currentValue).toBe(75);
				expect(verdict.threshold).toBe(70);
			}
		});

		it("allows when VPIN is below threshold", () => {
			const getVpin = () => Decimal.from(0.65);
			const guard = FlowRegimeGuard.create(getVpin, Decimal.from(0.7));
			const ctx = mockGuardContext();

			const verdict = guard.check(ctx);

			expect(verdict.type).toBe("allow");
		});

		it("blocks when VPIN is null (no data)", () => {
			const getVpin = () => null;
			const guard = FlowRegimeGuard.create(getVpin, Decimal.from(0.7));
			const ctx = mockGuardContext();

			const verdict = guard.check(ctx);

			expect(verdict.type).toBe("block");
			if (verdict.type === "block") {
				expect(verdict.guard).toBe("FlowRegime");
				expect(verdict.reason).toContain("VPIN data unavailable");
				expect(verdict.currentValue).toBe(0);
				expect(verdict.threshold).toBe(70);
			}
		});

		it("uses default 0.7 threshold when not specified", () => {
			const getVpin = () => Decimal.from(0.75);
			const guard = FlowRegimeGuard.create(getVpin);
			const ctx = mockGuardContext();

			const verdict = guard.check(ctx);

			expect(verdict.type).toBe("block");
		});

		it("allows when VPIN equals threshold", () => {
			const getVpin = () => Decimal.from(0.7);
			const guard = FlowRegimeGuard.create(getVpin, Decimal.from(0.7));
			const ctx = mockGuardContext();

			const verdict = guard.check(ctx);

			expect(verdict.type).toBe("allow");
		});
	});
});
