import { describe, expect, it } from "vitest";
import { Decimal } from "../../shared/decimal.js";
import type { DetectorContextLike, PositionLike } from "../types.js";
import { ProfitLockerExit } from "./profit-locker.js";

function mockPosition(): PositionLike {
	return {
		conditionId: "test-condition",
		tokenId: "test-token",
		side: "yes",
		entryPrice: Decimal.from(0.5),
		size: Decimal.from(100),
		highWaterMark: Decimal.from(0.5),
		entryTimeMs: 1000,
		pnlTotal: () => Decimal.zero(),
		drawdown: () => Decimal.zero(),
	};
}

function mockContext(): DetectorContextLike {
	return {
		conditionId: "test-condition",
		nowMs: () => 1000,
		spot: () => null,
		oraclePrice: () => null,
		timeRemainingMs: () => 0,
		bestBid: () => null,
		bestAsk: () => null,
		spread: () => null,
	};
}

describe("ProfitLockerExit", () => {
	describe("high-water mark tracking", () => {
		it("does not exit during profit climb", () => {
			const exit = ProfitLockerExit.create(Decimal.from(0.2));
			const position = mockPosition();
			const ctx = mockContext();

			exit.updatePnl(Decimal.from(100));
			expect(exit.shouldExit(position, ctx)).toBeNull();

			exit.updatePnl(Decimal.from(150));
			expect(exit.shouldExit(position, ctx)).toBeNull();

			exit.updatePnl(Decimal.from(200));
			expect(exit.shouldExit(position, ctx)).toBeNull();
		});

		it("exits when drawdown from peak exceeds threshold", () => {
			const exit = ProfitLockerExit.create(Decimal.from(0.2));
			const position = mockPosition();
			const ctx = mockContext();

			exit.updatePnl(Decimal.from(100));
			exit.updatePnl(Decimal.from(150));
			exit.updatePnl(Decimal.from(200));

			exit.updatePnl(Decimal.from(150));

			const reason = exit.shouldExit(position, ctx);

			expect(reason).not.toBeNull();
			expect(reason?.type).toBe("trailing_stop");
			if (reason?.type === "trailing_stop") {
				expect(reason.drawdownPct.toNumber()).toBeCloseTo(0.25);
			}
		});

		it("does not exit when drawdown is below threshold", () => {
			const exit = ProfitLockerExit.create(Decimal.from(0.2));
			const position = mockPosition();
			const ctx = mockContext();

			exit.updatePnl(Decimal.from(100));
			exit.updatePnl(Decimal.from(150));
			exit.updatePnl(Decimal.from(200));

			exit.updatePnl(Decimal.from(170));

			const reason = exit.shouldExit(position, ctx);

			expect(reason).toBeNull();
		});
	});

	describe("no profit scenarios", () => {
		it("does not exit when no profit has been made", () => {
			const exit = ProfitLockerExit.create(Decimal.from(0.2));
			const position = mockPosition();
			const ctx = mockContext();

			exit.updatePnl(Decimal.from(-50));
			exit.updatePnl(Decimal.from(-100));

			const reason = exit.shouldExit(position, ctx);

			expect(reason).toBeNull();
		});

		it("does not exit when PnL is zero", () => {
			const exit = ProfitLockerExit.create(Decimal.from(0.2));
			const position = mockPosition();
			const ctx = mockContext();

			exit.updatePnl(Decimal.zero());

			const reason = exit.shouldExit(position, ctx);

			expect(reason).toBeNull();
		});

		it("starts tracking when profit first becomes positive", () => {
			const exit = ProfitLockerExit.create(Decimal.from(0.2));
			const position = mockPosition();
			const ctx = mockContext();

			exit.updatePnl(Decimal.from(-50));
			exit.updatePnl(Decimal.from(-20));
			exit.updatePnl(Decimal.from(10));
			exit.updatePnl(Decimal.from(50));

			exit.updatePnl(Decimal.from(35));

			const reason = exit.shouldExit(position, ctx);

			expect(reason).not.toBeNull();
			expect(reason?.type).toBe("trailing_stop");
		});
	});

	describe("threshold edge cases", () => {
		it("exits at exact threshold boundary", () => {
			const exit = ProfitLockerExit.create(Decimal.from(0.2));
			const position = mockPosition();
			const ctx = mockContext();

			exit.updatePnl(Decimal.from(100));
			exit.updatePnl(Decimal.from(80));

			const reason = exit.shouldExit(position, ctx);

			expect(reason).not.toBeNull();
		});

		it("does not exit just below threshold", () => {
			const exit = ProfitLockerExit.create(Decimal.from(0.2));
			const position = mockPosition();
			const ctx = mockContext();

			exit.updatePnl(Decimal.from(100));
			exit.updatePnl(Decimal.from(80.1));

			const reason = exit.shouldExit(position, ctx);

			expect(reason).toBeNull();
		});

		it("works with very tight threshold", () => {
			const exit = ProfitLockerExit.create(Decimal.from(0.05));
			const position = mockPosition();
			const ctx = mockContext();

			exit.updatePnl(Decimal.from(100));
			exit.updatePnl(Decimal.from(94));

			const reason = exit.shouldExit(position, ctx);

			expect(reason).not.toBeNull();
		});
	});
});
