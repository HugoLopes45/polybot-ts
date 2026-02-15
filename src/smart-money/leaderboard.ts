import type { Decimal } from "../shared/decimal.js";
import type { EthAddress } from "../shared/identifiers.js";
import { type Result, err, ok } from "../shared/result.js";
import {
	type FetchTopTradersParams,
	type ILeaderboardClient,
	type LeaderboardClientConfig,
	type LeaderboardEntry,
	LeaderboardSortBy,
	type SmartMoneyCategory,
} from "./types.js";

export class LeaderboardClient implements ILeaderboardClient {
	readonly name = "LeaderboardClient";
	private readonly baseUrl: string;
	private readonly fetchFn: (
		url: string,
	) => Promise<Result<LeaderboardEntry | LeaderboardEntry[], Error>>;

	private constructor(config: LeaderboardClientConfig) {
		this.baseUrl = config.baseUrl;
		this.fetchFn =
			config.fetchFn ??
			(async (url: string) => {
				try {
					const response = await fetch(url);
					if (!response.ok) {
						return err(new Error(`HTTP ${response.status}`));
					}
					const data = await response.json();
					return ok(Array.isArray(data) ? data : [data]);
				} catch (e) {
					return err(e instanceof Error ? e : new Error(String(e)));
				}
			});
	}

	static create(config: LeaderboardClientConfig): Result<LeaderboardClient, Error> {
		if (!config.baseUrl || config.baseUrl.trim().length === 0) {
			return err(new Error("baseUrl is required"));
		}
		return ok(new LeaderboardClient(config));
	}

	async fetchTopTraders(params: FetchTopTradersParams): Promise<Result<LeaderboardEntry[], Error>> {
		const url = this.buildUrl(params);
		const response = await this.fetchFn(url);

		if (!response.ok) {
			return err(response.error);
		}

		const value = response.value;
		const entries = Array.isArray(value) ? value : [value];
		const filtered = this.filterByMinTradeCount(
			this.filterByMinWinRate(
				this.filterByCategories(entries, params.categories),
				params.minWinRate,
			),
			params.minTradeCount,
		);
		const sorted = this.sortEntries(filtered, params.sortBy);

		return ok(sorted.slice(0, params.limit));
	}

	async fetchByAddress(address: EthAddress): Promise<Result<LeaderboardEntry, Error>> {
		const url = `${this.baseUrl}/traders/${address}`;
		const response = await this.fetchFn(url);

		if (!response.ok) {
			return err(response.error);
		}

		const value = response.value;
		const entry = Array.isArray(value) ? value[0] : value;
		if (!entry) {
			return err(new Error("Trader not found"));
		}

		return ok(entry);
	}

	private buildUrl(params: FetchTopTradersParams): string {
		const url = new URL(`${this.baseUrl}/traders`);
		url.searchParams.set("limit", params.limit.toString());

		if (params.sortBy) {
			url.searchParams.set("sortBy", params.sortBy);
		}

		if (params.categories && params.categories.length > 0) {
			url.searchParams.set("categories", params.categories.join(","));
		}

		return url.toString();
	}

	private filterByCategories(
		entries: LeaderboardEntry[],
		categories: readonly SmartMoneyCategory[] | undefined,
	): LeaderboardEntry[] {
		if (!categories || categories.length === 0) {
			return entries;
		}
		return entries.filter((entry) => categories.some((cat) => entry.categories.includes(cat)));
	}

	private filterByMinWinRate(
		entries: LeaderboardEntry[],
		minWinRate: Decimal | undefined,
	): LeaderboardEntry[] {
		if (!minWinRate) {
			return entries;
		}
		return entries.filter((entry) => entry.winRate.gte(minWinRate));
	}

	private filterByMinTradeCount(
		entries: LeaderboardEntry[],
		minTradeCount: number | undefined,
	): LeaderboardEntry[] {
		if (minTradeCount === undefined) {
			return entries;
		}
		return entries.filter((entry) => entry.tradeCount >= minTradeCount);
	}

	private sortEntries(
		entries: LeaderboardEntry[],
		sortBy: LeaderboardSortBy | undefined,
	): LeaderboardEntry[] {
		const sorted = [...entries];
		const sortKey = sortBy ?? LeaderboardSortBy.WinRate;

		sorted.sort((a, b) => {
			switch (sortKey) {
				case LeaderboardSortBy.WinRate:
					return b.winRate.toNumber() - a.winRate.toNumber();
				case LeaderboardSortBy.TotalPnl:
					return b.totalPnl.toNumber() - a.totalPnl.toNumber();
				case LeaderboardSortBy.TradeCount:
					return b.tradeCount - a.tradeCount;
				default:
					return 0;
			}
		});

		return sorted;
	}
}

export {
	LeaderboardSortBy,
	type LeaderboardEntry,
	type FetchTopTradersParams,
	type SmartMoneyCategory,
	type ILeaderboardClient,
} from "./types.js";
