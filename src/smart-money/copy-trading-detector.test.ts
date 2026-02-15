import { describe, expect, it, vi } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { conditionId, ethAddress } from "../shared/identifiers.js";
import { MarketSide } from "../shared/market-side.js";
import { err, ok } from "../shared/result.js";
import type { DetectorContextLike } from "../signal/types.js";
import {
	type CopyTradingConfig,
	CopyTradingDetector,
	type CopyTradingSignal,
} from "./copy-trading-detector.js";

describe("CopyTradingDetector", () => {
	const createMockContext = (
		overrides: Partial<DetectorContextLike> = {},
	): DetectorContextLike => ({
		conditionId: conditionId("test-condition"),
		nowMs: () => 10000,
		spot: () => Decimal.from("0.5"),
		oraclePrice: () => Decimal.from("0.5"),
		timeRemainingMs: () => 3600000,
		bestBid: () => Decimal.from("0.49"),
		bestAsk: () => Decimal.from("0.51"),
		spread: () => Decimal.from("0.02"),
		...overrides,
	});

	describe("factory", () => {
		it("creates detector with config", () => {
			const mockLeaderboard = {
				fetchTopTraders: vi.fn().mockResolvedValue(ok([])),
				fetchByAddress: vi.fn(),
				name: "mock",
			};

			const mockProfiler = {
				profile: vi.fn(),
				analyzeRecentPerformance: vi.fn(),
				categorize: () => [],
				isEligibleForCopy: vi.fn(),
				name: "mock",
			};

			const config: CopyTradingConfig = {
				leaderboardClient: mockLeaderboard,
				walletProfiler: mockProfiler,
				minWinRate: Decimal.from("0.5"),
				minTradeCount: 5,
				scalingFactor: Decimal.from("0.5"),
			};

			const result = CopyTradingDetector.create(config);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBeDefined();
				expect(result.value.name).toBe("CopyTrading");
			}
		});

		it("returns err for missing leaderboardClient", () => {
			const result = CopyTradingDetector.create({
				leaderboardClient: undefined as never,
				walletProfiler: undefined as never,
				minWinRate: Decimal.from("0.5"),
				minTradeCount: 5,
				scalingFactor: Decimal.from("0.5"),
			});

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.message).toBe("leaderboardClient is required");
			}
		});
	});

	describe("detectEntry", () => {
		it("returns null when no cached traders", () => {
			const mockLeaderboard = {
				fetchTopTraders: vi.fn().mockResolvedValue(ok([])),
				fetchByAddress: vi.fn(),
				name: "mock",
			};

			const mockProfiler = {
				profile: vi.fn(),
				analyzeRecentPerformance: vi.fn(),
				categorize: () => [],
				isEligibleForCopy: vi.fn(),
				name: "mock",
			};

			const createResult = CopyTradingDetector.create({
				leaderboardClient: mockLeaderboard,
				walletProfiler: mockProfiler,
				minWinRate: Decimal.from("0.5"),
				minTradeCount: 5,
				scalingFactor: Decimal.from("0.5"),
			});

			if (!createResult.ok) throw new Error("Failed to create detector");
			const detector = createResult.value;

			const ctx = createMockContext();
			const result = detector.detectEntry(ctx);

			expect(result).toBeNull();
		});

		it("detects smart money entry signal from cached traders", async () => {
			const mockLeaderboard = {
				fetchTopTraders: vi.fn().mockResolvedValue(
					ok([
						{
							address: ethAddress("0xSmartTrader"),
							winRate: Decimal.from("0.75"),
							totalPnl: Decimal.from("1000"),
							tradeCount: 50,
							categories: ["momentum"],
						},
					]),
				),
				fetchByAddress: vi.fn(),
				name: "mock",
			};

			const mockProfiler = {
				profile: vi.fn(),
				analyzeRecentPerformance: vi.fn(),
				categorize: () => ["momentum"],
				isEligibleForCopy: vi.fn(),
				name: "mock",
			};

			const createResult = CopyTradingDetector.create({
				leaderboardClient: mockLeaderboard,
				walletProfiler: mockProfiler,
				minWinRate: Decimal.from("0.5"),
				minTradeCount: 5,
				scalingFactor: Decimal.from("0.5"),
			});

			if (!createResult.ok) throw new Error("Failed to create detector");
			const detector = createResult.value;

			await detector.refreshTraders();

			const ctx = createMockContext({
				bestBid: () => Decimal.from("0.4"),
			});
			const result = detector.detectEntry(ctx);

			expect(result).not.toBeNull();
			if (result) {
				expect(result.smartMoneyAddress).toBe(ethAddress("0xSmartTrader"));
				expect(result.confidence.toNumber()).toBeGreaterThan(0.5);
			}
		});

		it("filters by minWinRate", async () => {
			const mockLeaderboard = {
				fetchTopTraders: vi.fn().mockResolvedValue(
					ok([
						{
							address: ethAddress("0xLowWinRate"),
							winRate: Decimal.from("0.3"),
							totalPnl: Decimal.from("100"),
							tradeCount: 10,
							categories: [],
						},
					]),
				),
				fetchByAddress: vi.fn(),
				name: "mock",
			};

			const mockProfiler = {
				profile: vi.fn(),
				analyzeRecentPerformance: vi.fn(),
				categorize: () => [],
				isEligibleForCopy: vi.fn(),
				name: "mock",
			};

			const createResult = CopyTradingDetector.create({
				leaderboardClient: mockLeaderboard,
				walletProfiler: mockProfiler,
				minWinRate: Decimal.from("0.5"),
				minTradeCount: 5,
				scalingFactor: Decimal.from("0.5"),
			});

			if (!createResult.ok) throw new Error("Failed to create detector");
			const detector = createResult.value;

			await detector.refreshTraders();

			const ctx = createMockContext();
			const result = detector.detectEntry(ctx);

			expect(result).toBeNull();
		});
	});

	describe("toOrder", () => {
		it("converts signal to order with scaling", () => {
			const mockLeaderboard = {
				fetchTopTraders: vi.fn(),
				fetchByAddress: vi.fn(),
				name: "mock",
			};

			const mockProfiler = {
				profile: vi.fn(),
				analyzeRecentPerformance: vi.fn(),
				categorize: () => [],
				isEligibleForCopy: vi.fn(),
				name: "mock",
			};

			const createResult = CopyTradingDetector.create({
				leaderboardClient: mockLeaderboard,
				walletProfiler: mockProfiler,
				minWinRate: Decimal.from("0.5"),
				minTradeCount: 5,
				scalingFactor: Decimal.from("0.5"),
			});

			if (!createResult.ok) throw new Error("Failed to create detector");
			const detector = createResult.value;

			const ctx = createMockContext();

			const signal: CopyTradingSignal = {
				smartMoneyAddress: ethAddress("0x123"),
				side: MarketSide.Yes,
				price: Decimal.from("0.6"),
				size: Decimal.from("100"),
				confidence: Decimal.from("0.8"),
			};

			const order = detector.toOrder(signal, ctx);

			expect(order.conditionId).toBeDefined();
			expect(order.side).toBe(MarketSide.Yes);
			expect(order.direction).toBe("buy");
			expect(order.size.toString()).toBe("50");
		});

		it("applies dry-run mode correctly", () => {
			const mockLeaderboard = {
				fetchTopTraders: vi.fn(),
				fetchByAddress: vi.fn(),
				name: "mock",
			};

			const mockProfiler = {
				profile: vi.fn(),
				analyzeRecentPerformance: vi.fn(),
				categorize: () => [],
				isEligibleForCopy: vi.fn(),
				name: "mock",
			};

			const createResult = CopyTradingDetector.create({
				leaderboardClient: mockLeaderboard,
				walletProfiler: mockProfiler,
				minWinRate: Decimal.from("0.5"),
				minTradeCount: 5,
				scalingFactor: Decimal.from("0.5"),
				dryRun: true,
			});

			if (!createResult.ok) throw new Error("Failed to create detector");
			const detector = createResult.value;

			const ctx = createMockContext();

			const signal: CopyTradingSignal = {
				smartMoneyAddress: ethAddress("0x123"),
				side: MarketSide.Yes,
				price: Decimal.from("0.6"),
				size: Decimal.from("100"),
				confidence: Decimal.from("0.8"),
			};

			const order = detector.toOrder(signal, ctx);

			expect(order.size.isZero()).toBe(true);
		});
	});

	describe("refreshTraders", () => {
		it("fetches and caches traders", async () => {
			const mockLeaderboard = {
				fetchTopTraders: vi.fn().mockResolvedValue(
					ok([
						{
							address: ethAddress("0xTrader1"),
							winRate: Decimal.from("0.8"),
							totalPnl: Decimal.from("1000"),
							tradeCount: 50,
							categories: ["momentum"],
						},
						{
							address: ethAddress("0xTrader2"),
							winRate: Decimal.from("0.7"),
							totalPnl: Decimal.from("800"),
							tradeCount: 40,
							categories: ["arbitrage"],
						},
					]),
				),
				fetchByAddress: vi.fn(),
				name: "mock",
			};

			const mockProfiler = {
				profile: vi.fn(),
				analyzeRecentPerformance: vi.fn(),
				categorize: () => [],
				isEligibleForCopy: vi.fn(),
				name: "mock",
			};

			const createResult = CopyTradingDetector.create({
				leaderboardClient: mockLeaderboard,
				walletProfiler: mockProfiler,
				minWinRate: Decimal.from("0.5"),
				minTradeCount: 5,
				scalingFactor: Decimal.from("0.5"),
			});

			if (!createResult.ok) throw new Error("Failed to create detector");
			const detector = createResult.value;

			await detector.refreshTraders();

			const ctx = createMockContext();
			const result = detector.detectEntry(ctx);

			expect(result).not.toBeNull();
			if (result) {
				expect(result.smartMoneyAddress).toBe(ethAddress("0xTrader1"));
			}
		});
	});

	describe("filterByCategories", () => {
		it("filters traders by category", async () => {
			const mockLeaderboard = {
				fetchTopTraders: vi.fn().mockResolvedValue(
					ok([
						{
							address: ethAddress("0xMomentum"),
							winRate: Decimal.from("0.8"),
							totalPnl: Decimal.from("1000"),
							tradeCount: 50,
							categories: ["momentum"],
						},
						{
							address: ethAddress("0xReversal"),
							winRate: Decimal.from("0.7"),
							totalPnl: Decimal.from("800"),
							tradeCount: 40,
							categories: ["reversal"],
						},
					]),
				),
				fetchByAddress: vi.fn(),
				name: "mock",
			};

			const mockProfiler = {
				profile: vi.fn(),
				analyzeRecentPerformance: vi.fn(),
				categorize: () => ["momentum"],
				isEligibleForCopy: vi.fn(),
				name: "mock",
			};

			const createResult = CopyTradingDetector.create({
				leaderboardClient: mockLeaderboard,
				walletProfiler: mockProfiler,
				minWinRate: Decimal.from("0.5"),
				minTradeCount: 5,
				scalingFactor: Decimal.from("0.5"),
				categories: ["momentum"],
			});

			if (!createResult.ok) throw new Error("Failed to create detector");
			const detector = createResult.value;

			await detector.refreshTraders();

			const ctx = createMockContext();
			const result = detector.detectEntry(ctx);

			expect(result).not.toBeNull();
			if (result) {
				expect(result.smartMoneyAddress).toBe(ethAddress("0xMomentum"));
			}
		});
	});

	describe("error observability", () => {
		it("stores last refresh error for observability", async () => {
			const mockLeaderboard = {
				fetchTopTraders: vi.fn().mockResolvedValue(err(new Error("API down"))),
				fetchByAddress: vi.fn(),
				name: "mock",
			};

			const mockProfiler = {
				profile: vi.fn(),
				analyzeRecentPerformance: vi.fn(),
				categorize: () => [],
				isEligibleForCopy: vi.fn(),
				name: "mock",
			};

			const createResult = CopyTradingDetector.create({
				leaderboardClient: mockLeaderboard,
				walletProfiler: mockProfiler,
				scalingFactor: Decimal.from("0.5"),
			});

			if (!createResult.ok) throw new Error("Failed to create detector");
			const detector = createResult.value;

			await detector.refreshTraders();

			expect(detector.refreshError).toBeDefined();
			expect(detector.refreshError?.message).toBe("API down");
		});

		it("clears refresh error on successful refresh", async () => {
			const mockLeaderboard = {
				fetchTopTraders: vi
					.fn()
					.mockResolvedValueOnce(err(new Error("API down")))
					.mockResolvedValueOnce(
						ok([
							{
								address: ethAddress("0xTrader1"),
								winRate: Decimal.from("0.8"),
								totalPnl: Decimal.from("1000"),
								tradeCount: 50,
								categories: ["momentum"],
							},
						]),
					),
				fetchByAddress: vi.fn(),
				name: "mock",
			};

			const mockProfiler = {
				profile: vi.fn(),
				analyzeRecentPerformance: vi.fn(),
				categorize: () => [],
				isEligibleForCopy: vi.fn(),
				name: "mock",
			};

			const createResult = CopyTradingDetector.create({
				leaderboardClient: mockLeaderboard,
				walletProfiler: mockProfiler,
				scalingFactor: Decimal.from("0.5"),
			});

			if (!createResult.ok) throw new Error("Failed to create detector");
			const detector = createResult.value;

			await detector.refreshTraders();
			expect(detector.refreshError).toBeDefined();

			await detector.refreshTraders();
			expect(detector.refreshError).toBeNull();
		});

		it("minTradeCount=0 still filters (not disabled by truthiness)", async () => {
			const mockLeaderboard = {
				fetchTopTraders: vi.fn().mockResolvedValue(
					ok([
						{
							address: ethAddress("0xZeroTrades"),
							winRate: Decimal.from("0.0"),
							totalPnl: Decimal.zero(),
							tradeCount: 0,
							categories: [],
						},
					]),
				),
				fetchByAddress: vi.fn(),
				name: "mock",
			};

			const mockProfiler = {
				profile: vi.fn(),
				analyzeRecentPerformance: vi.fn(),
				categorize: () => [],
				isEligibleForCopy: vi.fn(),
				name: "mock",
			};

			const createResult = CopyTradingDetector.create({
				leaderboardClient: mockLeaderboard,
				walletProfiler: mockProfiler,
				minTradeCount: 1,
				scalingFactor: Decimal.from("0.5"),
			});

			if (!createResult.ok) throw new Error("Failed to create detector");
			const detector = createResult.value;

			await detector.refreshTraders();
			const ctx = createMockContext();
			const result = detector.detectEntry(ctx);

			expect(result).toBeNull();
		});
	});
});
