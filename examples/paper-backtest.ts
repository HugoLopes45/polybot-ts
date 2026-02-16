/**
 * Paper Backtest Example
 *
 * Runs a complete backtest with a simple mean-reversion strategy:
 * - Buys when price drops below 0.48
 * - Exits when position reaches 5% profit
 * - Uses synthetic mean-reverting market data
 * - Computes and displays performance metrics (Sharpe, max drawdown, win rate, profit factor)
 */

import {
	type BacktestDetector,
	CommissionModel,
	Decimal,
	type EntryState,
	FixedBpsSlippage,
	MarketSide,
	type ReplayTick,
	calcMaxDrawdown,
	calcProfitFactor,
	calcSharpe,
	calcWinRate,
	meanReverting,
	runBacktest,
} from "@polybot/sdk";

const detector: BacktestDetector = {
	shouldEnter(tick: ReplayTick) {
		if (tick.bid.lt(Decimal.from("0.48"))) {
			return { direction: "buy" as const, size: Decimal.from("10") };
		}
		return null;
	},

	shouldExit(_tick: ReplayTick, entry: EntryState) {
		const pnl = _tick.bid.sub(entry.entryPrice).div(entry.entryPrice);
		return pnl.gt(Decimal.from("0.05"));
	},
};

const ticks = meanReverting(
	{ startMs: 0, tickIntervalMs: 1000, numTicks: 500, side: MarketSide.Yes },
	0.5,
	0.08,
	0.03,
);

const result = runBacktest(
	{
		initialBalance: Decimal.from("1000"),
		slippage: FixedBpsSlippage.create(5),
		commission: CommissionModel.percentage(0.1),
	},
	ticks,
	detector,
);

const pnls = result.trades.map((t) => t.pnl);
const returns: Decimal[] = [];
for (let i = 1; i < result.equityCurve.length; i++) {
	const prev = result.equityCurve[i - 1];
	const curr = result.equityCurve[i];
	if (prev !== undefined && curr !== undefined && !prev.isZero()) {
		returns.push(curr.div(prev).sub(Decimal.one()));
	}
}

const sharpe = calcSharpe(returns, 252);
const maxDrawdown = calcMaxDrawdown(result.equityCurve);
const winRate = calcWinRate(pnls);
const profitFactor = calcProfitFactor(pnls);

console.log("Backtest Results:");
console.log(`Final Balance: ${result.finalBalance.toString()}`);
console.log(`Total P&L: ${result.totalPnl.toString()}`);
console.log(`Trade Count: ${result.tradeCount}`);
console.log(`Win Rate: ${winRate.toString()}`);
console.log(`Profit Factor: ${profitFactor.toString()}`);
console.log(`Sharpe Ratio: ${sharpe.toString()}`);
console.log(`Max Drawdown: ${maxDrawdown.toString()}`);
