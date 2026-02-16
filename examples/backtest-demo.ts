/**
 * Backtest Demo (Simple)
 *
 * Minimal mean-reversion backtest on synthetic data:
 * - Buys when price dips below 0.45, exits at 10% profit
 * - 5 bps fixed slippage, no commission
 * - Prints Sharpe, win rate, and max drawdown
 *
 * For an advanced example with commission models, see paper-backtest.ts.
 */

import type { BacktestDetector, EntryState, ReplayTick } from "@polybot/sdk";
import {
	Decimal,
	FixedBpsSlippage,
	MarketSide,
	calcMaxDrawdown,
	calcSharpe,
	calcWinRate,
	meanReverting,
	runBacktest,
} from "@polybot/sdk";

// ── Detector: buy when price dips below 0.45, exit at 10% profit ────

const detector: BacktestDetector = {
	shouldEnter(tick: ReplayTick) {
		if (tick.bid.lt(Decimal.from("0.49"))) {
			return { direction: "buy" as const, size: Decimal.from("10") };
		}
		return null;
	},

	shouldExit(tick: ReplayTick, entry: EntryState) {
		const pnl = tick.bid.sub(entry.entryPrice).div(entry.entryPrice);
		return pnl.gt(Decimal.from("0.10"));
	},
};

// ── Generate synthetic mean-reverting ticks ──────────────────────────

const ticks = Array.from(
	meanReverting(
		{ startMs: 0, tickIntervalMs: 1000, numTicks: 500, side: MarketSide.Yes },
		0.5,
		0.08,
		0.04,
	),
);

// ── Run backtest ────────────────────────────────────────────────────

const result = runBacktest(
	{
		initialBalance: Decimal.from("1000"),
		slippage: FixedBpsSlippage.create(5),
	},
	ticks,
	detector,
);

// ── Compute and print metrics ───────────────────────────────────────

const pnls = result.trades.map((t) => t.pnl);
const winRate = calcWinRate(pnls);
const maxDrawdown = calcMaxDrawdown(result.equityCurve);

const returns: Decimal[] = [];
for (let i = 1; i < result.equityCurve.length; i++) {
	const prev = result.equityCurve[i - 1];
	const curr = result.equityCurve[i];
	if (prev && curr && !prev.isZero()) {
		returns.push(curr.div(prev).sub(Decimal.from("1")));
	}
}
const sharpe = calcSharpe(returns);

console.log("Backtest Results:");
console.log(`  Final Balance: ${result.finalBalance.toString()}`);
console.log(`  Total P&L:     ${result.totalPnl.toString()}`);
console.log(`  Trade Count:   ${result.tradeCount}`);
console.log(`  Win Rate:      ${winRate.toString()}`);
console.log(`  Max Drawdown:  ${maxDrawdown.toString()}`);
console.log(`  Sharpe Ratio:  ${sharpe.toString()}`);
