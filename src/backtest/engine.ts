import { Decimal } from "../shared/decimal.js";
import { OrderDirection } from "../signal/types.js";
import type { CommissionModel, SlippageModel } from "./slippage-model.js";
/**
 * Backtest engine — drives a tick loop over replay data, feeds ticks through a detector,
 * executes via paper trading logic, tracks equity curve, and collects trade P&Ls.
 */
import type { ReplayTick } from "./types.js";

/** Configuration for a backtest run. */
export interface BacktestConfig {
	readonly initialBalance: Decimal;
	readonly slippage?: SlippageModel;
	readonly commission?: CommissionModel;
}

/** Final result of a backtest run. */
export interface BacktestResult {
	readonly trades: readonly TradeRecord[];
	readonly equityCurve: readonly Decimal[];
	readonly finalBalance: Decimal;
	readonly totalPnl: Decimal;
	readonly tradeCount: number;
}

/** Record of a single completed trade. */
export interface TradeRecord {
	readonly entryTick: ReplayTick;
	readonly exitTick: ReplayTick;
	readonly direction: OrderDirection;
	readonly size: Decimal;
	readonly entryPrice: Decimal;
	readonly exitPrice: Decimal;
	readonly pnl: Decimal;
	readonly commission: Decimal;
}

/** Simplified strategy interface for backtesting. */
export interface BacktestDetector {
	shouldEnter(tick: ReplayTick): { direction: OrderDirection; size: Decimal } | null;
	shouldExit(tick: ReplayTick, entry: EntryState): boolean;
}

/** Current position state during backtest. */
export interface EntryState {
	readonly direction: OrderDirection;
	readonly entryPrice: Decimal;
	readonly size: Decimal;
	readonly entryTimestampMs: number;
	readonly entryTick: ReplayTick;
}

/**
 * Run a backtest over a stream of ticks using a detector.
 *
 * @param config Backtest configuration (initial balance, slippage, commission).
 * @param ticks Iterable of replay ticks (can be array or generator).
 * @param detector Strategy that decides when to enter and exit.
 * @returns BacktestResult with trades, equity curve, and P&L.
 */
export function runBacktest(
	config: BacktestConfig,
	ticks: Iterable<ReplayTick>,
	detector: BacktestDetector,
): BacktestResult {
	const { initialBalance, slippage, commission } = config;

	const trades: TradeRecord[] = [];
	const equityCurve: Decimal[] = [];
	let balance = initialBalance;
	let currentEntry: EntryState | null = null;

	const tickArray = Array.from(ticks);
	if (tickArray.length === 0) {
		return {
			trades: [],
			equityCurve: [],
			finalBalance: initialBalance,
			totalPnl: Decimal.zero(),
			tradeCount: 0,
		};
	}

	for (let i = 0; i < tickArray.length; i++) {
		const tick = tickArray[i];
		if (tick === undefined) continue;

		const isLastTick = i === tickArray.length - 1;

		if (currentEntry === null) {
			const entrySignal = detector.shouldEnter(tick);
			if (entrySignal !== null) {
				const { direction, size } = entrySignal;
				const basePrice = direction === OrderDirection.Buy ? tick.ask : tick.bid;
				const isBuy = direction === OrderDirection.Buy;
				const entryPrice = slippage ? slippage.apply(basePrice, size, isBuy) : basePrice;

				currentEntry = {
					direction,
					entryPrice,
					size,
					entryTimestampMs: tick.timestampMs,
					entryTick: tick,
				};
			}
		}

		if (currentEntry !== null) {
			const shouldExit = detector.shouldExit(tick, currentEntry);

			if (shouldExit || isLastTick) {
				const baseExitPrice = currentEntry.direction === OrderDirection.Buy ? tick.bid : tick.ask;
				const isBuyExit = currentEntry.direction === OrderDirection.Sell;
				const exitPrice = slippage
					? slippage.apply(baseExitPrice, currentEntry.size, isBuyExit)
					: baseExitPrice;

				const rawPnl =
					currentEntry.direction === OrderDirection.Buy
						? exitPrice.sub(currentEntry.entryPrice).mul(currentEntry.size)
						: currentEntry.entryPrice.sub(exitPrice).mul(currentEntry.size);

				const entryNotional = currentEntry.entryPrice.mul(currentEntry.size);
				const exitNotional = exitPrice.mul(currentEntry.size);
				const entryCommission = commission ? commission.calc(entryNotional) : Decimal.zero();
				const exitCommission = commission ? commission.calc(exitNotional) : Decimal.zero();
				const totalCommission = entryCommission.add(exitCommission);

				const netPnl = rawPnl.sub(totalCommission);
				balance = balance.add(netPnl);

				trades.push({
					entryTick: currentEntry.entryTick,
					exitTick: tick,
					direction: currentEntry.direction,
					size: currentEntry.size,
					entryPrice: currentEntry.entryPrice,
					exitPrice,
					pnl: rawPnl,
					commission: totalCommission,
				});

				currentEntry = null;
			}
		}

		equityCurve.push(balance);
	}

	const totalPnl = balance.sub(initialBalance);

	return {
		trades,
		equityCurve,
		finalBalance: balance,
		totalPnl,
		tradeCount: trades.length,
	};
}
