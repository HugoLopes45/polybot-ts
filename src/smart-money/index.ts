export {
	LeaderboardClient,
	LeaderboardSortBy,
	type LeaderboardEntry,
	type FetchTopTradersParams,
	type SmartMoneyCategory,
	type ILeaderboardClient,
} from "./leaderboard.js";

export {
	WalletProfiler,
	type Trade,
	type WalletProfile,
	type RecentPerformance,
	type RecentPerformanceParams,
	type EligibilityParams,
	type WalletProfilerConfig,
} from "./wallet-profiler.js";

export {
	CopyTradingDetector,
	type CopyTradingSignal,
	type CopyTradingConfig,
	type IWalletProfiler,
	type TraderStats,
} from "./copy-trading-detector.js";
