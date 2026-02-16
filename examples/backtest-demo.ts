import {
	type BacktestDetector,
	Decimal,
	type EntryState,
	priceTrend,
	type ReplayTick,
	runBacktest,
} from "../src/index.js";

const detector: BacktestDetector = {
	shouldEnter(tick: ReplayTick) {
		if (tick.bid.lt(Decimal.from("0.45"))) {
			return { direction: "buy" as const, size: Decimal.from("10") };
		}
		return null;
	},

	shouldExit(tick: ReplayTick, entry: EntryState) {
		const pnl = tick.bid.sub(entry.entryPrice).div(entry.entryPrice);
		return pnl.gt(Decimal.from("0.10"));
	},
};

const ticks = priceTrend({ start: 0.5, end: 0.6, steps: 200 });
const result = runBacktest({ initialBalance: Decimal.from("1000") }, ticks, detector);

console.log("Backtest Results:");
console.log(`Final Balance: ${result.finalBalance.toString()}`);
console.log(`Total P&L: ${result.totalPnl.toString()}`);
console.log(`Trade Count: ${result.tradeCount}`);
console.log(`Win Rate: ${result.winRate?.toString() ?? "N/A"}`);
console.log(`Max Drawdown: ${result.maxDrawdown.toString()}`);
