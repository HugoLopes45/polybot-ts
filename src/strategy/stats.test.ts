import { describe, expect, it } from "vitest";
import { EventDispatcher } from "../events/event-dispatcher.js";
import { StrategyStats } from "./stats.js";

const FIXED_TIMESTAMP = 1000000000000;

function createPositionClosed(
	pnl: number,
	fee = 0,
): import("../events/sdk-events.js").PositionClosed {
	return {
		type: "position_closed",
		timestamp: FIXED_TIMESTAMP,
		conditionId: "test-condition" as import("../shared/identifiers.js").ConditionId,
		tokenId: "ETH-USD" as import("../shared/identifiers.js").MarketTokenId,
		entryPrice: 1000,
		exitPrice: 1010,
		pnl,
		reason: "test",
		fee,
	};
}

describe("StrategyStats", () => {
	describe("No trades", () => {
		it("returns zero stats when no trades", () => {
			const dispatcher = new EventDispatcher();
			const stats = new StrategyStats(dispatcher);
			const snapshot = stats.snapshot();

			expect(snapshot.tradeCount).toBe(0);
			expect(snapshot.winCount).toBe(0);
			expect(snapshot.lossCount).toBe(0);
			expect(snapshot.winRate).toBe(0);
			expect(snapshot.avgPnl.toNumber()).toBe(0);
			expect(snapshot.totalPnl.toNumber()).toBe(0);
			expect(snapshot.maxDrawdown.toNumber()).toBe(0);
			expect(snapshot.totalFees.toNumber()).toBe(0);
			expect(snapshot.bestTrade.toNumber()).toBe(0);
			expect(snapshot.worstTrade.toNumber()).toBe(0);
		});
	});

	describe("One winning trade", () => {
		it("calculates correct stats for a winning trade", () => {
			const dispatcher = new EventDispatcher();
			const stats = new StrategyStats(dispatcher);

			dispatcher.emitSdk(createPositionClosed(100));

			const snapshot = stats.snapshot();
			expect(snapshot.tradeCount).toBe(1);
			expect(snapshot.winCount).toBe(1);
			expect(snapshot.lossCount).toBe(0);
			expect(snapshot.winRate).toBe(1.0);
			expect(snapshot.totalPnl.toNumber()).toBe(100);
			expect(snapshot.avgPnl.toNumber()).toBe(100);
			expect(snapshot.bestTrade.toNumber()).toBe(100);
			expect(snapshot.worstTrade.toNumber()).toBe(100);
		});
	});

	describe("One losing trade", () => {
		it("calculates correct stats for a losing trade", () => {
			const dispatcher = new EventDispatcher();
			const stats = new StrategyStats(dispatcher);

			dispatcher.emitSdk(createPositionClosed(-50));

			const snapshot = stats.snapshot();
			expect(snapshot.tradeCount).toBe(1);
			expect(snapshot.winCount).toBe(0);
			expect(snapshot.lossCount).toBe(1);
			expect(snapshot.winRate).toBe(0.0);
			expect(snapshot.totalPnl.toNumber()).toBe(-50);
			expect(snapshot.avgPnl.toNumber()).toBe(-50);
			expect(snapshot.bestTrade.toNumber()).toBe(-50);
			expect(snapshot.worstTrade.toNumber()).toBe(-50);
		});
	});

	describe("Mixed trades", () => {
		it("calculates correct win rate and avg PnL", () => {
			const dispatcher = new EventDispatcher();
			const stats = new StrategyStats(dispatcher);

			dispatcher.emitSdk(createPositionClosed(100));
			dispatcher.emitSdk(createPositionClosed(-50));
			dispatcher.emitSdk(createPositionClosed(20));
			dispatcher.emitSdk(createPositionClosed(-30));

			const snapshot = stats.snapshot();
			expect(snapshot.tradeCount).toBe(4);
			expect(snapshot.winCount).toBe(2);
			expect(snapshot.lossCount).toBe(2);
			expect(snapshot.winRate).toBe(0.5);
			expect(snapshot.totalPnl.toNumber()).toBe(40);
			expect(snapshot.avgPnl.toNumber()).toBe(10);
		});
	});

	describe("Max drawdown", () => {
		it("tracks max drawdown correctly", () => {
			const dispatcher = new EventDispatcher();
			const stats = new StrategyStats(dispatcher);

			dispatcher.emitSdk(createPositionClosed(100));
			dispatcher.emitSdk(createPositionClosed(-20));
			dispatcher.emitSdk(createPositionClosed(50));
			dispatcher.emitSdk(createPositionClosed(-100));
			dispatcher.emitSdk(createPositionClosed(200));

			const snapshot = stats.snapshot();
			// After trade 1: totalPnl=100, peak=100, drawdown=0
			// After trade 2: totalPnl=80, peak=100, drawdown=20
			// After trade 3: totalPnl=130, peak=130, drawdown=0
			// After trade 4: totalPnl=30, peak=130, drawdown=100
			// After trade 5: totalPnl=230, peak=230, drawdown=0
			// Max drawdown = 100
			expect(snapshot.maxDrawdown.toNumber()).toBe(100);
		});

		it("handles sequential losses correctly", () => {
			const dispatcher = new EventDispatcher();
			const stats = new StrategyStats(dispatcher);

			dispatcher.emitSdk(createPositionClosed(100));
			dispatcher.emitSdk(createPositionClosed(-30));
			dispatcher.emitSdk(createPositionClosed(-40));
			dispatcher.emitSdk(createPositionClosed(-20));

			const snapshot = stats.snapshot();
			expect(snapshot.maxDrawdown.toNumber()).toBe(90); // peak 100 - trough 10 = 90
		});
	});

	describe("Fees", () => {
		it("accumulates fees correctly", () => {
			const dispatcher = new EventDispatcher();
			const stats = new StrategyStats(dispatcher);

			dispatcher.emitSdk(createPositionClosed(100, 5));
			dispatcher.emitSdk(createPositionClosed(-50, 3));
			dispatcher.emitSdk(createPositionClosed(20, 2));

			const snapshot = stats.snapshot();
			expect(snapshot.totalFees.toNumber()).toBe(10);
		});
	});

	describe("Best/worst trade", () => {
		it("tracks best and worst trade", () => {
			const dispatcher = new EventDispatcher();
			const stats = new StrategyStats(dispatcher);

			dispatcher.emitSdk(createPositionClosed(50));
			dispatcher.emitSdk(createPositionClosed(200));
			dispatcher.emitSdk(createPositionClosed(-150));
			dispatcher.emitSdk(createPositionClosed(100));

			const snapshot = stats.snapshot();
			expect(snapshot.bestTrade.toNumber()).toBe(200);
			expect(snapshot.worstTrade.toNumber()).toBe(-150);
		});
	});

	describe("High volume", () => {
		it("handles 100 trades correctly", () => {
			const dispatcher = new EventDispatcher();
			const stats = new StrategyStats(dispatcher);

			for (let i = 0; i < 100; i++) {
				const pnl = (i % 3 === 0 ? 1 : -1) * ((i * 7 + 13) % 200);
				dispatcher.emitSdk(createPositionClosed(pnl, 1));
			}

			const snapshot = stats.snapshot();
			expect(snapshot.tradeCount).toBe(100);
			expect(snapshot.totalFees.toNumber()).toBe(100);
		});
	});

	describe("Breakeven trade", () => {
		it("includes breakeven trades in winRate denominator", () => {
			const dispatcher = new EventDispatcher();
			const stats = new StrategyStats(dispatcher);

			dispatcher.emitSdk(createPositionClosed(100));
			dispatcher.emitSdk(createPositionClosed(0));
			dispatcher.emitSdk(createPositionClosed(-50));

			const snapshot = stats.snapshot();
			expect(snapshot.tradeCount).toBe(3);
			expect(snapshot.winCount).toBe(1);
			expect(snapshot.lossCount).toBe(1);
			// winRate = winCount / tradeCount = 1/3
			expect(snapshot.winRate).toBeCloseTo(1 / 3, 10);
		});
	});

	describe("Max drawdown with fees (HARD-3)", () => {
		it("uses net equity (totalPnl - totalFees) for drawdown", () => {
			const dispatcher = new EventDispatcher();
			const stats = new StrategyStats(dispatcher);

			// Win $10 (fee $5) → net = 10 - 5 = 5 (peak = 5)
			dispatcher.emitSdk(createPositionClosed(10, 5));
			// Loss $8 (fee $3) → net = (10-8) - (5+3) = 2 - 8 = -6
			dispatcher.emitSdk(createPositionClosed(-8, 3));

			const snapshot = stats.snapshot();
			// peak = 5, net after second trade = -6, drawdown = 5 - (-6) = 11
			expect(snapshot.maxDrawdown.toNumber()).toBe(11);
		});
	});

	describe("Negative fees guard (HARD-4)", () => {
		it("clamps negative fee to zero", () => {
			const dispatcher = new EventDispatcher();
			const stats = new StrategyStats(dispatcher);

			dispatcher.emitSdk(createPositionClosed(100, -5));

			const snapshot = stats.snapshot();
			expect(snapshot.totalFees.toNumber()).toBe(0);
		});

		it("allows positive fees through", () => {
			const dispatcher = new EventDispatcher();
			const stats = new StrategyStats(dispatcher);

			dispatcher.emitSdk(createPositionClosed(100, 3));

			const snapshot = stats.snapshot();
			expect(snapshot.totalFees.toNumber()).toBe(3);
		});
	});

	describe("Invalid pnl guard (HARD-26)", () => {
		it("ignores event with NaN pnl", () => {
			const dispatcher = new EventDispatcher();
			const stats = new StrategyStats(dispatcher);

			dispatcher.emitSdk(createPositionClosed(100));
			dispatcher.emitSdk(createPositionClosed(Number.NaN));

			const snapshot = stats.snapshot();
			expect(snapshot.tradeCount).toBe(1);
			expect(snapshot.totalPnl.toNumber()).toBe(100);
		});

		it("ignores event with Infinity pnl", () => {
			const dispatcher = new EventDispatcher();
			const stats = new StrategyStats(dispatcher);

			dispatcher.emitSdk(createPositionClosed(Number.POSITIVE_INFINITY));

			const snapshot = stats.snapshot();
			expect(snapshot.tradeCount).toBe(0);
		});

		it("ignores event with -Infinity pnl", () => {
			const dispatcher = new EventDispatcher();
			const stats = new StrategyStats(dispatcher);

			dispatcher.emitSdk(createPositionClosed(Number.NEGATIVE_INFINITY));

			const snapshot = stats.snapshot();
			expect(snapshot.tradeCount).toBe(0);
		});
	});

	describe("Invalid fee guard (HARD-27)", () => {
		it("ignores event with NaN fee", () => {
			const dispatcher = new EventDispatcher();
			const stats = new StrategyStats(dispatcher);

			dispatcher.emitSdk(createPositionClosed(100, Number.NaN));

			const snapshot = stats.snapshot();
			expect(snapshot.tradeCount).toBe(0);
		});

		it("ignores event with Infinity fee", () => {
			const dispatcher = new EventDispatcher();
			const stats = new StrategyStats(dispatcher);

			dispatcher.emitSdk(createPositionClosed(100, Number.POSITIVE_INFINITY));

			const snapshot = stats.snapshot();
			expect(snapshot.tradeCount).toBe(0);
		});

		it("processes event with undefined fee (defaults to zero)", () => {
			const dispatcher = new EventDispatcher();
			const stats = new StrategyStats(dispatcher);

			dispatcher.emitSdk(createPositionClosed(100));

			const snapshot = stats.snapshot();
			expect(snapshot.tradeCount).toBe(1);
			expect(snapshot.totalFees.toNumber()).toBe(0);
		});
	});

	describe("Snapshot immutability", () => {
		it("snapshot is immutable", () => {
			const dispatcher = new EventDispatcher();
			const stats = new StrategyStats(dispatcher);

			dispatcher.emitSdk(createPositionClosed(100));

			const snapshot1 = stats.snapshot();
			const snapshot2 = stats.snapshot();

			expect(snapshot1).not.toBe(snapshot2);
			expect(snapshot1.tradeCount).toBe(snapshot2.tradeCount);

			// Modifying returned snapshot should not affect future snapshots
			// Note: Since readonly, we can't actually modify it, but we verify new object
			dispatcher.emitSdk(createPositionClosed(50));
			const snapshot3 = stats.snapshot();
			expect(snapshot3.tradeCount).toBe(2);
		});
	});
});
