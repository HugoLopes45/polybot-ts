import { Decimal } from "../shared/decimal.js";
import type { EthAddress } from "../shared/identifiers.js";
import { marketTokenId } from "../shared/identifiers.js";
import { MarketSide } from "../shared/market-side.js";
import type { MarketSide as MarketSideType } from "../shared/market-side.js";
import { type Result, err, ok } from "../shared/result.js";
import type { Clock } from "../shared/time.js";
import { SystemClock } from "../shared/time.js";
import type { DetectorContextLike, SdkOrderIntent, SignalDetector } from "../signal/types.js";
import type { ILeaderboardClient, LeaderboardEntry, SmartMoneyCategory } from "./types.js";

export interface TraderStats {
	readonly winRate: Decimal;
	readonly tradeCount: number;
	readonly totalPnl: Decimal;
}

export interface IWalletProfiler {
	readonly name: string;
	categorize(profile: TraderStats): readonly SmartMoneyCategory[];
}

export interface CopyTradingSignal {
	readonly smartMoneyAddress: EthAddress;
	readonly side: MarketSideType;
	readonly price: Decimal;
	readonly size: Decimal;
	readonly confidence: Decimal;
}

export interface CopyTradingConfig {
	readonly leaderboardClient: ILeaderboardClient;
	readonly walletProfiler: IWalletProfiler;
	readonly minWinRate?: Decimal;
	readonly minTradeCount?: number;
	readonly scalingFactor: Decimal;
	readonly dryRun?: boolean;
	readonly categories?: readonly SmartMoneyCategory[];
	readonly maxTradersToTrack?: number;
	readonly clock?: Clock;
}

export class CopyTradingDetector implements SignalDetector<CopyTradingConfig, CopyTradingSignal> {
	readonly name = "CopyTrading";
	private readonly config: CopyTradingConfig;
	private readonly clock: Clock;
	private cachedTraders: LeaderboardEntry[] = [];
	private lastFetchMs = 0;
	private readonly cacheTtlMs: number = 60000;
	private isRefreshing = false;
	private lastRefreshError: Error | null = null;

	private constructor(config: CopyTradingConfig) {
		this.config = config;
		this.clock = config.clock ?? SystemClock;
	}

	static create(config: CopyTradingConfig): Result<CopyTradingDetector, Error> {
		if (!config.leaderboardClient) {
			return err(new Error("leaderboardClient is required"));
		}
		if (!config.walletProfiler) {
			return err(new Error("walletProfiler is required"));
		}
		if (!config.scalingFactor) {
			return err(new Error("scalingFactor is required"));
		}
		return ok(new CopyTradingDetector(config));
	}

	detectEntry(ctx: DetectorContextLike): CopyTradingSignal | null {
		const now = ctx.nowMs();

		if (this.cachedTraders.length === 0 || now - this.lastFetchMs > this.cacheTtlMs) {
			if (!this.isRefreshing) {
				this.isRefreshing = true;
				this.refreshTraders()
					.catch((e: unknown) => {
						this.lastRefreshError = e instanceof Error ? e : new Error(String(e));
					})
					.finally(() => {
						this.isRefreshing = false;
					});
			}
			return null;
		}

		for (const trader of this.cachedTraders) {
			if (!this.meetsEligibility(trader)) {
				continue;
			}

			const currentPrice = ctx.bestBid(MarketSide.Yes);
			if (!currentPrice) continue;

			const avgWin = this.estimateAvgWin(trader);
			const avgLoss = this.estimateAvgLoss(trader);
			const side = this.determineSide(avgWin, avgLoss, currentPrice);
			const confidence = this.calculateConfidence(trader);

			return {
				smartMoneyAddress: trader.address,
				side,
				price: currentPrice,
				size: avgWin,
				confidence,
			};
		}

		return null;
	}

	async refreshTraders(): Promise<void> {
		const categories = this.config.categories ?? [];
		const fetchResult = await this.config.leaderboardClient.fetchTopTraders({
			limit: this.config.maxTradersToTrack ?? 10,
			categories,
		});

		if (fetchResult.ok) {
			this.cachedTraders = fetchResult.value;
			this.lastFetchMs = this.clock.now();
			this.lastRefreshError = null;
		} else {
			this.lastRefreshError = fetchResult.error;
		}
	}

	get refreshError(): Error | null {
		return this.lastRefreshError;
	}

	toOrder(signal: CopyTradingSignal, ctx: DetectorContextLike): SdkOrderIntent {
		const size = this.config.dryRun ? Decimal.zero() : signal.size.mul(this.config.scalingFactor);

		return {
			conditionId: ctx.conditionId,
			tokenId:
				signal.side === MarketSide.Yes ? marketTokenId("yes-token") : marketTokenId("no-token"),
			side: signal.side,
			direction: signal.side === MarketSide.Yes ? "buy" : "sell",
			price: signal.price,
			size,
		};
	}

	private meetsEligibility(trader: LeaderboardEntry): boolean {
		if (this.config.minWinRate !== undefined && trader.winRate.lt(this.config.minWinRate)) {
			return false;
		}
		if (this.config.minTradeCount !== undefined && trader.tradeCount < this.config.minTradeCount) {
			return false;
		}
		return true;
	}

	private estimateAvgWin(trader: LeaderboardEntry): Decimal {
		if (!trader.totalPnl.isPositive()) {
			return Decimal.from("50");
		}
		const winCount = Math.max(estimatedWinCount(trader), 1);
		return trader.totalPnl.div(Decimal.from(winCount));
	}

	private estimateAvgLoss(trader: LeaderboardEntry): Decimal {
		const lossCount = trader.tradeCount - estimatedWinCount(trader);
		if (lossCount <= 0) {
			return Decimal.from("25");
		}
		const estimatedTotalLoss = trader.totalPnl.isNegative()
			? trader.totalPnl.abs()
			: Decimal.from("25").mul(Decimal.from(lossCount));
		return estimatedTotalLoss.div(Decimal.from(lossCount));
	}

	private calculateConfidence(trader: LeaderboardEntry): Decimal {
		const normalizedTradeCount = Decimal.min(
			Decimal.from(trader.tradeCount).div(Decimal.from(100)),
			Decimal.one(),
		);
		const normalizedPnl = trader.totalPnl.isPositive()
			? Decimal.min(trader.totalPnl.div(Decimal.from("1000")), Decimal.one())
			: Decimal.zero();

		return trader.winRate
			.mul(Decimal.from("0.5"))
			.add(normalizedTradeCount.mul(Decimal.from("0.3")))
			.add(normalizedPnl.mul(Decimal.from("0.2")));
	}

	private determineSide(avgWin: Decimal, avgLoss: Decimal, currentPrice: Decimal): MarketSideType {
		const riskReward = avgLoss.isZero() ? Decimal.from("999") : avgWin.div(avgLoss.abs());

		if (riskReward.gte(Decimal.from("2")) && currentPrice.lt(Decimal.from("0.5"))) {
			return MarketSide.Yes;
		}

		if (riskReward.lt(Decimal.from("1")) && currentPrice.gt(Decimal.from("0.5"))) {
			return MarketSide.No;
		}

		return MarketSide.Yes;
	}
}

function estimatedWinCount(trader: LeaderboardEntry): number {
	return trader.winRate.mul(Decimal.from(trader.tradeCount)).toNumber();
}
