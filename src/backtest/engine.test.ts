import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { MarketSide } from "../shared/market-side.js";
import { OrderDirection } from "../signal/types.js";
import type { BacktestConfig, BacktestDetector } from "./engine.js";
import { runBacktest } from "./engine.js";
import { CommissionModel, FixedBpsSlippage } from "./slippage-model.js";
import type { ReplayTick } from "./types.js";

describe("runBacktest", () => {
	const mkTick = (
		timestampMs: number,
		bid: number,
		ask: number,
		side: MarketSide = MarketSide.Yes,
	): ReplayTick => ({
		timestampMs,
		bid: Decimal.from(bid),
		ask: Decimal.from(ask),
		side,
	});

	describe("empty / no-signal cases", () => {
		it("empty tick stream → zero trades, initial balance", () => {
			const detector: BacktestDetector = {
				shouldEnter: () => null,
				shouldExit: () => false,
			};
			const config: BacktestConfig = { initialBalance: Decimal.from(1000) };
			const result = runBacktest(config, [], detector);

			expect(result.tradeCount).toBe(0);
			expect(result.trades).toEqual([]);
			expect(result.finalBalance.toNumber()).toBe(1000);
			expect(result.totalPnl.toNumber()).toBe(0);
			expect(result.equityCurve).toEqual([]);
		});

		it("detector never enters → zero trades, initial balance maintained", () => {
			const ticks = [mkTick(1000, 0.5, 0.51), mkTick(2000, 0.52, 0.53), mkTick(3000, 0.54, 0.55)];
			const detector: BacktestDetector = {
				shouldEnter: () => null,
				shouldExit: () => false,
			};
			const config: BacktestConfig = { initialBalance: Decimal.from(1000) };
			const result = runBacktest(config, ticks, detector);

			expect(result.tradeCount).toBe(0);
			expect(result.trades).toEqual([]);
			expect(result.finalBalance.toNumber()).toBe(1000);
			expect(result.totalPnl.toNumber()).toBe(0);
			expect(result.equityCurve.length).toBe(3);
			expect(result.equityCurve[0]?.toNumber()).toBe(1000);
			expect(result.equityCurve[2]?.toNumber()).toBe(1000);
		});
	});

	describe("single trade lifecycle", () => {
		it("buy trade with positive P&L (price goes up)", () => {
			const ticks = [mkTick(1000, 0.5, 0.51), mkTick(2000, 0.52, 0.53), mkTick(3000, 0.54, 0.55)];
			let entered = false;
			const detector: BacktestDetector = {
				shouldEnter: (tick) => {
					if (!entered && tick.timestampMs === 1000) {
						entered = true;
						return { direction: OrderDirection.Buy, size: Decimal.from(10) };
					}
					return null;
				},
				shouldExit: (tick) => tick.timestampMs === 3000,
			};
			const config: BacktestConfig = { initialBalance: Decimal.from(1000) };
			const result = runBacktest(config, ticks, detector);

			expect(result.tradeCount).toBe(1);
			expect(result.trades.length).toBe(1);
			const trade = result.trades[0];
			expect(trade?.direction).toBe(OrderDirection.Buy);
			expect(trade?.size.toNumber()).toBe(10);
			expect(trade?.entryPrice.toNumber()).toBe(0.51);
			expect(trade?.exitPrice.toNumber()).toBe(0.54);
			expect(trade?.pnl.toNumber()).toBeCloseTo(0.3, 10);
			expect(trade?.commission.toNumber()).toBe(0);
			expect(result.finalBalance.toNumber()).toBeCloseTo(1000.3, 10);
			expect(result.totalPnl.toNumber()).toBeCloseTo(0.3, 10);
		});

		it("sell trade with positive P&L (price goes down)", () => {
			const ticks = [mkTick(1000, 0.54, 0.55), mkTick(2000, 0.52, 0.53), mkTick(3000, 0.5, 0.51)];
			let entered = false;
			const detector: BacktestDetector = {
				shouldEnter: (tick) => {
					if (!entered && tick.timestampMs === 1000) {
						entered = true;
						return { direction: OrderDirection.Sell, size: Decimal.from(10) };
					}
					return null;
				},
				shouldExit: (tick) => tick.timestampMs === 3000,
			};
			const config: BacktestConfig = { initialBalance: Decimal.from(1000) };
			const result = runBacktest(config, ticks, detector);

			expect(result.tradeCount).toBe(1);
			const trade = result.trades[0];
			expect(trade?.direction).toBe(OrderDirection.Sell);
			expect(trade?.entryPrice.toNumber()).toBe(0.54);
			expect(trade?.exitPrice.toNumber()).toBe(0.51);
			expect(trade?.pnl.toNumber()).toBeCloseTo(0.3, 10);
			expect(result.finalBalance.toNumber()).toBeCloseTo(1000.3, 10);
		});

		it("force exit at end of stream", () => {
			const ticks = [mkTick(1000, 0.5, 0.51), mkTick(2000, 0.52, 0.53)];
			let entered = false;
			const detector: BacktestDetector = {
				shouldEnter: (tick) => {
					if (!entered && tick.timestampMs === 1000) {
						entered = true;
						return { direction: OrderDirection.Buy, size: Decimal.from(10) };
					}
					return null;
				},
				shouldExit: () => false,
			};
			const config: BacktestConfig = { initialBalance: Decimal.from(1000) };
			const result = runBacktest(config, ticks, detector);

			expect(result.tradeCount).toBe(1);
			const trade = result.trades[0];
			expect(trade?.exitTick.timestampMs).toBe(2000);
			expect(trade?.exitPrice.toNumber()).toBe(0.52);
		});

		it("single tick → force exit with entry = exit at same price", () => {
			const ticks = [mkTick(1000, 0.5, 0.51)];
			const detector: BacktestDetector = {
				shouldEnter: () => ({ direction: OrderDirection.Buy, size: Decimal.from(10) }),
				shouldExit: () => false,
			};
			const config: BacktestConfig = { initialBalance: Decimal.from(1000) };
			const result = runBacktest(config, ticks, detector);

			expect(result.tradeCount).toBe(1);
			const trade = result.trades[0];
			expect(trade?.entryTick.timestampMs).toBe(1000);
			expect(trade?.exitTick.timestampMs).toBe(1000);
			expect(trade?.entryPrice.toNumber()).toBe(0.51);
			expect(trade?.exitPrice.toNumber()).toBe(0.5);
			expect(trade?.pnl.toNumber()).toBeCloseTo(-0.1, 10);
		});
	});

	describe("slippage model", () => {
		it("buy entry with slippage → price goes up", () => {
			const ticks = [mkTick(1000, 0.5, 0.51), mkTick(2000, 0.52, 0.53)];
			let entered = false;
			const detector: BacktestDetector = {
				shouldEnter: (tick) => {
					if (!entered && tick.timestampMs === 1000) {
						entered = true;
						return { direction: OrderDirection.Buy, size: Decimal.from(10) };
					}
					return null;
				},
				shouldExit: (tick) => tick.timestampMs === 2000,
			};
			const slippage = FixedBpsSlippage.create(100);
			const config: BacktestConfig = { initialBalance: Decimal.from(1000), slippage };
			const result = runBacktest(config, ticks, detector);

			const trade = result.trades[0];
			const expectedEntry = 0.51 * 1.01;
			expect(trade?.entryPrice.toNumber()).toBeCloseTo(expectedEntry, 10);
		});

		it("sell entry with slippage → price goes down", () => {
			const ticks = [mkTick(1000, 0.54, 0.55), mkTick(2000, 0.5, 0.51)];
			let entered = false;
			const detector: BacktestDetector = {
				shouldEnter: (tick) => {
					if (!entered && tick.timestampMs === 1000) {
						entered = true;
						return { direction: OrderDirection.Sell, size: Decimal.from(10) };
					}
					return null;
				},
				shouldExit: (tick) => tick.timestampMs === 2000,
			};
			const slippage = FixedBpsSlippage.create(100);
			const config: BacktestConfig = { initialBalance: Decimal.from(1000), slippage };
			const result = runBacktest(config, ticks, detector);

			const trade = result.trades[0];
			const expectedEntry = 0.54 * 0.99;
			expect(trade?.entryPrice.toNumber()).toBeCloseTo(expectedEntry, 10);
		});

		it("buy exit (selling) with slippage → price goes down", () => {
			const ticks = [mkTick(1000, 0.5, 0.51), mkTick(2000, 0.54, 0.55)];
			let entered = false;
			const detector: BacktestDetector = {
				shouldEnter: (tick) => {
					if (!entered && tick.timestampMs === 1000) {
						entered = true;
						return { direction: OrderDirection.Buy, size: Decimal.from(10) };
					}
					return null;
				},
				shouldExit: (tick) => tick.timestampMs === 2000,
			};
			const slippage = FixedBpsSlippage.create(100);
			const config: BacktestConfig = { initialBalance: Decimal.from(1000), slippage };
			const result = runBacktest(config, ticks, detector);

			const trade = result.trades[0];
			const expectedExit = 0.54 * 0.99;
			expect(trade?.exitPrice.toNumber()).toBeCloseTo(expectedExit, 10);
		});

		it("sell exit (buying) with slippage → price goes up", () => {
			const ticks = [mkTick(1000, 0.54, 0.55), mkTick(2000, 0.5, 0.51)];
			let entered = false;
			const detector: BacktestDetector = {
				shouldEnter: (tick) => {
					if (!entered && tick.timestampMs === 1000) {
						entered = true;
						return { direction: OrderDirection.Sell, size: Decimal.from(10) };
					}
					return null;
				},
				shouldExit: (tick) => tick.timestampMs === 2000,
			};
			const slippage = FixedBpsSlippage.create(100);
			const config: BacktestConfig = { initialBalance: Decimal.from(1000), slippage };
			const result = runBacktest(config, ticks, detector);

			const trade = result.trades[0];
			const expectedExit = 0.51 * 1.01;
			expect(trade?.exitPrice.toNumber()).toBeCloseTo(expectedExit, 10);
		});
	});

	describe("commission model", () => {
		it("flat commission deducted from each trade", () => {
			const ticks = [mkTick(1000, 0.5, 0.51), mkTick(2000, 0.52, 0.53)];
			let entered = false;
			const detector: BacktestDetector = {
				shouldEnter: (tick) => {
					if (!entered && tick.timestampMs === 1000) {
						entered = true;
						return { direction: OrderDirection.Buy, size: Decimal.from(10) };
					}
					return null;
				},
				shouldExit: (tick) => tick.timestampMs === 2000,
			};
			const commission = CommissionModel.flat(0.1);
			const config: BacktestConfig = { initialBalance: Decimal.from(1000), commission };
			const result = runBacktest(config, ticks, detector);

			const trade = result.trades[0];
			const entryCommission = 0.1;
			const exitCommission = 0.1;
			const totalCommission = entryCommission + exitCommission;
			expect(trade?.commission.toNumber()).toBeCloseTo(totalCommission, 10);

			const rawPnl = (0.52 - 0.51) * 10;
			const netPnl = rawPnl - totalCommission;
			expect(result.totalPnl.toNumber()).toBeCloseTo(netPnl, 10);
		});

		it("percentage commission deducted from each trade", () => {
			const ticks = [mkTick(1000, 0.5, 0.51), mkTick(2000, 0.52, 0.53)];
			let entered = false;
			const detector: BacktestDetector = {
				shouldEnter: (tick) => {
					if (!entered && tick.timestampMs === 1000) {
						entered = true;
						return { direction: OrderDirection.Buy, size: Decimal.from(10) };
					}
					return null;
				},
				shouldExit: (tick) => tick.timestampMs === 2000,
			};
			const commission = CommissionModel.percentage(1);
			const config: BacktestConfig = { initialBalance: Decimal.from(1000), commission };
			const result = runBacktest(config, ticks, detector);

			const trade = result.trades[0];
			const entryNotional = 0.51 * 10;
			const exitNotional = 0.52 * 10;
			const entryCommission = entryNotional * 0.01;
			const exitCommission = exitNotional * 0.01;
			const totalCommission = entryCommission + exitCommission;
			expect(trade?.commission.toNumber()).toBeCloseTo(totalCommission, 10);
		});

		it("combined slippage + commission", () => {
			const ticks = [mkTick(1000, 0.5, 0.51), mkTick(2000, 0.54, 0.55)];
			let entered = false;
			const detector: BacktestDetector = {
				shouldEnter: (tick) => {
					if (!entered && tick.timestampMs === 1000) {
						entered = true;
						return { direction: OrderDirection.Buy, size: Decimal.from(10) };
					}
					return null;
				},
				shouldExit: (tick) => tick.timestampMs === 2000,
			};
			const slippage = FixedBpsSlippage.create(100);
			const commission = CommissionModel.flat(0.05);
			const config: BacktestConfig = { initialBalance: Decimal.from(1000), slippage, commission };
			const result = runBacktest(config, ticks, detector);

			const trade = result.trades[0];
			const entryPrice = 0.51 * 1.01;
			const exitPrice = 0.54 * 0.99;
			const pnl = (exitPrice - entryPrice) * 10;
			const totalCommission = 0.1;
			const netPnl = pnl - totalCommission;

			expect(trade?.pnl.toNumber()).toBeCloseTo(pnl, 10);
			expect(trade?.commission.toNumber()).toBeCloseTo(totalCommission, 10);
			expect(result.totalPnl.toNumber()).toBeCloseTo(netPnl, 10);
		});
	});

	describe("multiple trades", () => {
		it("two complete trades in sequence", () => {
			const ticks = [
				mkTick(1000, 0.5, 0.51),
				mkTick(2000, 0.52, 0.53),
				mkTick(3000, 0.54, 0.55),
				mkTick(4000, 0.56, 0.57),
			];
			let tradeCount = 0;
			const detector: BacktestDetector = {
				shouldEnter: (tick) => {
					if (tradeCount === 0 && tick.timestampMs === 1000) {
						tradeCount++;
						return { direction: OrderDirection.Buy, size: Decimal.from(10) };
					}
					if (tradeCount === 1 && tick.timestampMs === 3000) {
						tradeCount++;
						return { direction: OrderDirection.Sell, size: Decimal.from(5) };
					}
					return null;
				},
				shouldExit: (tick, entry) => {
					if (entry.direction === OrderDirection.Buy && tick.timestampMs === 2000) return true;
					if (entry.direction === OrderDirection.Sell && tick.timestampMs === 4000) return true;
					return false;
				},
			};
			const config: BacktestConfig = { initialBalance: Decimal.from(1000) };
			const result = runBacktest(config, ticks, detector);

			expect(result.tradeCount).toBe(2);
			expect(result.trades.length).toBe(2);

			const trade1 = result.trades[0];
			expect(trade1?.direction).toBe(OrderDirection.Buy);
			expect(trade1?.entryPrice.toNumber()).toBe(0.51);
			expect(trade1?.exitPrice.toNumber()).toBe(0.52);

			const trade2 = result.trades[1];
			expect(trade2?.direction).toBe(OrderDirection.Sell);
			expect(trade2?.entryPrice.toNumber()).toBe(0.54);
			expect(trade2?.exitPrice.toNumber()).toBe(0.57);

			const pnl1 = (0.52 - 0.51) * 10;
			const pnl2 = (0.54 - 0.57) * 5;
			expect(result.totalPnl.toNumber()).toBeCloseTo(pnl1 + pnl2, 10);
		});
	});

	describe("equity curve", () => {
		it("tracks equity at every tick", () => {
			const ticks = [mkTick(1000, 0.5, 0.51), mkTick(2000, 0.52, 0.53), mkTick(3000, 0.54, 0.55)];
			let entered = false;
			const detector: BacktestDetector = {
				shouldEnter: (tick) => {
					if (!entered && tick.timestampMs === 1000) {
						entered = true;
						return { direction: OrderDirection.Buy, size: Decimal.from(10) };
					}
					return null;
				},
				shouldExit: (tick) => tick.timestampMs === 2000,
			};
			const config: BacktestConfig = { initialBalance: Decimal.from(1000) };
			const result = runBacktest(config, ticks, detector);

			expect(result.equityCurve.length).toBe(3);

			const equity1 = result.equityCurve[0];
			expect(equity1?.toNumber()).toBe(1000);

			const equity2 = result.equityCurve[1];
			const pnl1 = (0.52 - 0.51) * 10;
			expect(equity2?.toNumber()).toBeCloseTo(1000 + pnl1, 10);

			const equity3 = result.equityCurve[2];
			expect(equity3?.toNumber()).toBeCloseTo(1000 + pnl1, 10);
		});

		it("equity curve with no entries", () => {
			const ticks = [mkTick(1000, 0.5, 0.51), mkTick(2000, 0.52, 0.53)];
			const detector: BacktestDetector = {
				shouldEnter: () => null,
				shouldExit: () => false,
			};
			const config: BacktestConfig = { initialBalance: Decimal.from(1000) };
			const result = runBacktest(config, ticks, detector);

			expect(result.equityCurve.length).toBe(2);
			expect(result.equityCurve[0]?.toNumber()).toBe(1000);
			expect(result.equityCurve[1]?.toNumber()).toBe(1000);
		});
	});
});
