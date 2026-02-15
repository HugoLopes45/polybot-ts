import { Decimal } from "../shared/decimal.js";
import type { ConditionId, EthAddress } from "../shared/identifiers.js";
import type { MarketSide as MarketSideType } from "../shared/market-side.js";
import { type Result, err, ok } from "../shared/result.js";
import type { Clock } from "../shared/time.js";
import { SystemClock } from "../shared/time.js";
import { SmartMoneyCategory as Category, type SmartMoneyCategory } from "./types.js";

export interface Trade {
	readonly address: EthAddress;
	readonly conditionId: ConditionId;
	readonly side: MarketSideType;
	readonly price: Decimal;
	readonly size: Decimal;
	readonly realizedPnl: Decimal;
	readonly openedAt: number;
	readonly closedAt: number;
}

export interface WalletProfile {
	readonly address: EthAddress;
	readonly tradeCount: number;
	readonly winCount: number;
	readonly winRate: Decimal;
	readonly totalPnl: Decimal;
	readonly avgWin: Decimal;
	readonly avgLoss: Decimal;
	readonly largestWin: Decimal;
	readonly largestLoss: Decimal;
}

export interface RecentPerformanceParams {
	readonly lookbackMs: number;
}

export interface RecentPerformance {
	readonly recentTradeCount: number;
	readonly recentWinCount: number;
	readonly recentWinRate: Decimal;
	readonly recentPnl: Decimal;
}

export interface EligibilityParams {
	readonly minWinRate?: Decimal;
	readonly minTradeCount?: number;
	readonly minTotalPnl?: Decimal;
}

export interface WalletProfilerConfig {
	readonly historyFetchFn: (address: EthAddress) => Promise<Result<readonly Trade[], Error>>;
	readonly clock?: Clock;
}

export class WalletProfiler {
	readonly name = "WalletProfiler";
	private readonly historyFetchFn: (
		address: EthAddress,
	) => Promise<Result<readonly Trade[], Error>>;
	private readonly clock: Clock;

	private constructor(config: WalletProfilerConfig) {
		this.historyFetchFn = config.historyFetchFn;
		this.clock = config.clock ?? SystemClock;
	}

	static create(config: WalletProfilerConfig): Result<WalletProfiler, Error> {
		if (!config.historyFetchFn) {
			return err(new Error("historyFetchFn is required"));
		}
		return ok(new WalletProfiler(config));
	}

	async profile(address: EthAddress): Promise<Result<WalletProfile, Error>> {
		const response = await this.historyFetchFn(address);

		if (!response.ok) {
			return err(response.error);
		}

		const trades = response.value;
		const profile = this.computeProfile(address, trades);
		return ok(profile);
	}

	async analyzeRecentPerformance(
		address: EthAddress,
		params: RecentPerformanceParams,
	): Promise<Result<RecentPerformance, Error>> {
		const response = await this.historyFetchFn(address);

		if (!response.ok) {
			return err(response.error);
		}

		const now = this.clock.now();
		const cutoff = now - params.lookbackMs;
		const recentTrades = response.value.filter((t) => t.closedAt >= cutoff);

		const winCount = recentTrades.filter((t) => t.realizedPnl.isPositive()).length;
		const totalPnl = recentTrades.reduce((acc, t) => acc.add(t.realizedPnl), Decimal.zero());
		const winRate =
			recentTrades.length > 0
				? Decimal.from(winCount).div(Decimal.from(recentTrades.length))
				: Decimal.zero();

		return ok({
			recentTradeCount: recentTrades.length,
			recentWinCount: winCount,
			recentWinRate: winRate,
			recentPnl: totalPnl,
		});
	}

	categorize(profile: WalletProfile): readonly SmartMoneyCategory[] {
		const categories: SmartMoneyCategory[] = [];

		if (profile.winRate.gte(Decimal.from("0.6")) && profile.tradeCount >= 10) {
			categories.push(Category.Momentum);
		}

		const avgWin = profile.avgWin;
		const avgLoss = profile.avgLoss.abs();
		if (!avgLoss.isZero() && avgWin.div(avgLoss).gte(Decimal.from("2"))) {
			categories.push(Category.Reversal);
		}

		if (profile.tradeCount >= 20 && profile.totalPnl.isPositive()) {
			const consistency = Decimal.from(profile.winCount).div(Decimal.from(profile.tradeCount));
			if (consistency.gte(Decimal.from("0.5"))) {
				categories.push(Category.Arbitrage);
			}
		}

		return categories;
	}

	async isEligibleForCopy(
		address: EthAddress,
		params: EligibilityParams,
	): Promise<Result<boolean, Error>> {
		const profileResult = await this.profile(address);

		if (!profileResult.ok) {
			return err(profileResult.error);
		}

		const profile = profileResult.value;

		if (params.minWinRate !== undefined && profile.winRate.lt(params.minWinRate)) {
			return ok(false);
		}

		if (params.minTradeCount !== undefined && profile.tradeCount < params.minTradeCount) {
			return ok(false);
		}

		if (params.minTotalPnl !== undefined && profile.totalPnl.lt(params.minTotalPnl)) {
			return ok(false);
		}

		return ok(true);
	}

	private computeProfile(address: EthAddress, trades: readonly Trade[]): WalletProfile {
		if (trades.length === 0) {
			return {
				address,
				tradeCount: 0,
				winCount: 0,
				winRate: Decimal.zero(),
				totalPnl: Decimal.zero(),
				avgWin: Decimal.zero(),
				avgLoss: Decimal.zero(),
				largestWin: Decimal.zero(),
				largestLoss: Decimal.zero(),
			};
		}

		const wins = trades.filter((t) => t.realizedPnl.isPositive());
		const losses = trades.filter((t) => t.realizedPnl.isNegative());

		const winCount = wins.length;
		const totalPnl = trades.reduce((acc, t) => acc.add(t.realizedPnl), Decimal.zero());
		const winRate = Decimal.from(winCount).div(Decimal.from(trades.length));

		const avgWin =
			wins.length > 0
				? wins
						.reduce((acc, t) => acc.add(t.realizedPnl), Decimal.zero())
						.div(Decimal.from(wins.length))
				: Decimal.zero();

		const totalLoss = losses.reduce((acc, t) => acc.add(t.realizedPnl), Decimal.zero());
		const avgLoss =
			losses.length > 0 ? totalLoss.div(Decimal.from(losses.length)).abs() : Decimal.zero();

		const largestWin = wins.reduce(
			(max, t) => (t.realizedPnl.gt(max) ? t.realizedPnl : max),
			Decimal.zero(),
		);

		const largestLoss = losses.reduce((min, t) => {
			const absLoss = t.realizedPnl.abs();
			return absLoss.gt(min) ? absLoss : min;
		}, Decimal.zero());

		return {
			address,
			tradeCount: trades.length,
			winCount,
			winRate,
			totalPnl,
			avgWin,
			avgLoss,
			largestWin,
			largestLoss,
		};
	}
}
