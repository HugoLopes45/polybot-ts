/**
 * Backtest performance metrics — pure functions for strategy evaluation.
 *
 * All computations use Decimal for financial precision.
 */
import { Decimal } from "../shared/decimal.js";

const MAX_PROFIT_FACTOR = Decimal.from(9999);

/**
 * Annualized Sharpe ratio from an array of periodic returns.
 * Sharpe = (mean / stddev) * sqrt(periodsPerYear)
 *
 * @param returns Array of periodic returns (e.g., daily)
 * @param periodsPerYear Default 252 (trading days)
 */
export function calcSharpe(returns: readonly Decimal[], periodsPerYear = 252): Decimal {
	if (returns.length < 2) return Decimal.zero();

	const n = returns.length;
	let sum = 0;
	for (const r of returns) {
		sum += r.toNumber();
	}
	const mean = sum / n;

	let varSum = 0;
	for (const r of returns) {
		const diff = r.toNumber() - mean;
		varSum += diff * diff;
	}
	const stddev = Math.sqrt(varSum / (n - 1));

	if (stddev < 1e-15) return Decimal.zero();

	const dailySharpe = mean / stddev;
	return Decimal.from(dailySharpe * Math.sqrt(periodsPerYear));
}

/**
 * Profit factor = gross profit / gross loss.
 * Returns 0 if no wins. Returns capped value if no losses.
 */
export function calcProfitFactor(pnls: readonly Decimal[]): Decimal {
	if (pnls.length === 0) return Decimal.zero();

	let grossProfit = 0;
	let grossLoss = 0;

	for (const pnl of pnls) {
		const v = pnl.toNumber();
		if (v > 0) grossProfit += v;
		else if (v < 0) grossLoss += Math.abs(v);
	}

	if (grossProfit === 0) return Decimal.zero();
	if (grossLoss === 0) return MAX_PROFIT_FACTOR;
	return Decimal.from(grossProfit / grossLoss);
}

/**
 * Maximum drawdown as a fraction of peak equity.
 * Returns 0 for empty or monotonically increasing equity.
 */
export function calcMaxDrawdown(equity: readonly Decimal[]): Decimal {
	if (equity.length === 0) return Decimal.zero();

	let peak = equity[0]?.toNumber() ?? 0;
	let maxDd = 0;

	for (const e of equity) {
		const v = e.toNumber();
		if (v > peak) peak = v;
		if (peak > 0) {
			const dd = (peak - v) / peak;
			if (dd > maxDd) maxDd = dd;
		}
	}

	return Decimal.from(maxDd);
}

/**
 * Calmar ratio = annualized return / max drawdown.
 * Returns 0 if max drawdown is zero.
 *
 * @param equity Equity curve array
 * @param totalPeriods Number of periods in the data
 * @param periodsPerYear Default 252
 */
export function calcCalmarRatio(
	equity: readonly Decimal[],
	totalPeriods: number,
	periodsPerYear = 252,
): Decimal {
	if (equity.length < 2) return Decimal.zero();

	const first = equity[0]?.toNumber() ?? 0;
	const last = equity[equity.length - 1]?.toNumber() ?? 0;
	if (first <= 0) return Decimal.zero();

	const totalReturn = (last - first) / first;
	const years = totalPeriods / periodsPerYear;
	const annualReturn = years > 0 ? totalReturn / years : 0;

	const maxDd = calcMaxDrawdown(equity).toNumber();
	if (maxDd < 1e-15) return Decimal.zero();

	return Decimal.from(annualReturn / maxDd);
}

/**
 * Win rate = number of profitable trades / total trades.
 * Zero P&L counts as non-win.
 */
export function calcWinRate(pnls: readonly Decimal[]): Decimal {
	if (pnls.length === 0) return Decimal.zero();

	let wins = 0;
	for (const pnl of pnls) {
		if (pnl.isPositive()) wins++;
	}

	return Decimal.from(wins / pnls.length);
}
