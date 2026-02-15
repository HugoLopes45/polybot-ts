import type { Decimal } from "../shared/decimal.js";
import type { EthAddress } from "../shared/identifiers.js";
import type { Result } from "../shared/result.js";

export const SmartMoneyCategory = {
	Momentum: "momentum",
	Reversal: "reversal",
	Arbitrage: "arbitrage",
} as const;

export type SmartMoneyCategory = (typeof SmartMoneyCategory)[keyof typeof SmartMoneyCategory];

export interface LeaderboardEntry {
	readonly address: EthAddress;
	readonly winRate: Decimal;
	readonly totalPnl: Decimal;
	readonly tradeCount: number;
	readonly categories: readonly SmartMoneyCategory[];
}

export const LeaderboardSortBy = {
	WinRate: "winRate",
	TotalPnl: "totalPnl",
	TradeCount: "tradeCount",
} as const;

export type LeaderboardSortBy = (typeof LeaderboardSortBy)[keyof typeof LeaderboardSortBy];

export interface FetchTopTradersParams {
	readonly limit: number;
	readonly sortBy?: LeaderboardSortBy;
	readonly categories?: readonly SmartMoneyCategory[];
	readonly minWinRate?: Decimal;
	readonly minTradeCount?: number;
}

export interface LeaderboardClientConfig {
	readonly baseUrl: string;
	readonly fetchFn?: (url: string) => Promise<Result<LeaderboardEntry | LeaderboardEntry[], Error>>;
}

export interface ILeaderboardClient {
	readonly name: string;
	fetchTopTraders(params: FetchTopTradersParams): Promise<Result<LeaderboardEntry[], Error>>;
	fetchByAddress(address: EthAddress): Promise<Result<LeaderboardEntry, Error>>;
}
