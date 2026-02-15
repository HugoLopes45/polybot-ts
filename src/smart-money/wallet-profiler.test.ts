import { describe, expect, it, vi } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { ethAddress } from "../shared/identifiers.js";
import { MarketSide } from "../shared/market-side.js";
import { err, ok } from "../shared/result.js";
import { WalletProfiler } from "./wallet-profiler.js";

describe("WalletProfiler", () => {
	describe("factory", () => {
		it("creates profiler with config", () => {
			const result = WalletProfiler.create({
				historyFetchFn: vi.fn().mockResolvedValue(ok([])),
			});
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBeDefined();
			}
		});

		it("returns err for missing historyFetchFn", () => {
			const result = WalletProfiler.create({
				historyFetchFn: undefined as never,
			});
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.message).toBe("historyFetchFn is required");
			}
		});
	});

	describe("profile", () => {
		it("returns Result.ok with full profile", async () => {
			const mockTrades = [
				{
					address: ethAddress("0x123"),
					conditionId: "cond1",
					side: MarketSide.Yes,
					price: Decimal.from("0.6"),
					size: Decimal.from("100"),
					realizedPnl: Decimal.from("50"),
					openedAt: 1000,
					closedAt: 2000,
				},
				{
					address: ethAddress("0x123"),
					conditionId: "cond2",
					side: MarketSide.No,
					price: Decimal.from("0.4"),
					size: Decimal.from("100"),
					realizedPnl: Decimal.from("-20"),
					openedAt: 3000,
					closedAt: 4000,
				},
			];

			const createResult = WalletProfiler.create({
				historyFetchFn: vi.fn().mockResolvedValue(ok(mockTrades)),
			});

			if (!createResult.ok) throw new Error("Failed to create profiler");
			const profiler = createResult.value;

			const result = await profiler.profile(ethAddress("0x123"));

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value.address).toBe(ethAddress("0x123"));
				expect(result.value.tradeCount).toBe(2);
				expect(result.value.winRate.toString()).toBe("0.5");
				expect(result.value.totalPnl.toString()).toBe("30");
			}
		});

		it("returns empty profile for no trades", async () => {
			const createResult = WalletProfiler.create({
				historyFetchFn: vi.fn().mockResolvedValue(ok([])),
			});

			if (!createResult.ok) throw new Error("Failed to create profiler");
			const profiler = createResult.value;

			const result = await profiler.profile(ethAddress("0x123"));

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value.tradeCount).toBe(0);
				expect(result.value.winRate.toString()).toBe("0");
				expect(result.value.totalPnl.toString()).toBe("0");
			}
		});

		it("returns Result.err on fetch failure", async () => {
			const createResult = WalletProfiler.create({
				historyFetchFn: vi.fn().mockResolvedValue(err(new Error("Network error"))),
			});

			if (!createResult.ok) throw new Error("Failed to create profiler");
			const profiler = createResult.value;

			const result = await profiler.profile(ethAddress("0x123"));

			expect(result.ok).toBe(false);
		});
	});

	describe("analyzeRecentPerformance", () => {
		it("analyzes recent trades correctly", async () => {
			const now = 10000;
			const mockTrades = [
				{
					address: ethAddress("0x123"),
					conditionId: "cond1",
					side: MarketSide.Yes,
					price: Decimal.from("0.6"),
					size: Decimal.from("100"),
					realizedPnl: Decimal.from("50"),
					openedAt: now - 86400000,
					closedAt: now - 43200000,
				},
				{
					address: ethAddress("0x123"),
					conditionId: "cond2",
					side: MarketSide.No,
					price: Decimal.from("0.4"),
					size: Decimal.from("100"),
					realizedPnl: Decimal.from("-20"),
					openedAt: now - 21600000,
					closedAt: now,
				},
			];

			const createResult = WalletProfiler.create({
				historyFetchFn: vi.fn().mockResolvedValue(ok(mockTrades)),
				clock: { now: () => now },
			});

			if (!createResult.ok) throw new Error("Failed to create profiler");
			const profiler = createResult.value;

			const result = await profiler.analyzeRecentPerformance(ethAddress("0x123"), {
				lookbackMs: 86400000,
			});

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value.recentTradeCount).toBe(2);
				expect(result.value.recentWinRate.toString()).toBe("0.5");
				expect(result.value.recentPnl.toString()).toBe("30");
			}
		});

		it("filters out old trades", async () => {
			const now = 20000;
			const mockTrades = [
				{
					address: ethAddress("0x123"),
					conditionId: "cond1",
					side: MarketSide.Yes,
					price: Decimal.from("0.6"),
					size: Decimal.from("100"),
					realizedPnl: Decimal.from("100"),
					openedAt: now - 172800000,
					closedAt: now - 172800000,
				},
				{
					address: ethAddress("0x123"),
					conditionId: "cond2",
					side: MarketSide.No,
					price: Decimal.from("0.4"),
					size: Decimal.from("100"),
					realizedPnl: Decimal.from("50"),
					openedAt: now - 43200000,
					closedAt: now,
				},
			];

			const createResult = WalletProfiler.create({
				historyFetchFn: vi.fn().mockResolvedValue(ok(mockTrades)),
				clock: { now: () => now },
			});

			if (!createResult.ok) throw new Error("Failed to create profiler");
			const profiler = createResult.value;

			const result = await profiler.analyzeRecentPerformance(ethAddress("0x123"), {
				lookbackMs: 86400000,
			});

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value.recentTradeCount).toBe(1);
				expect(result.value.recentPnl.toString()).toBe("50");
			}
		});
	});

	describe("categorize", () => {
		it("categorizes wallet correctly and largestLoss is absolute value", async () => {
			const mockTrades = [
				{
					address: ethAddress("0x123"),
					conditionId: "cond1",
					side: MarketSide.Yes,
					price: Decimal.from("0.3"),
					size: Decimal.from("100"),
					realizedPnl: Decimal.from("70"),
					openedAt: 1000,
					closedAt: 2000,
				},
				{
					address: ethAddress("0x123"),
					conditionId: "cond2",
					side: MarketSide.No,
					price: Decimal.from("0.4"),
					size: Decimal.from("100"),
					realizedPnl: Decimal.from("30"),
					openedAt: 3000,
					closedAt: 4000,
				},
				{
					address: ethAddress("0x123"),
					conditionId: "cond3",
					side: MarketSide.Yes,
					price: Decimal.from("0.3"),
					size: Decimal.from("100"),
					realizedPnl: Decimal.from("70"),
					openedAt: 5000,
					closedAt: 6000,
				},
				{
					address: ethAddress("0x123"),
					conditionId: "cond4",
					side: MarketSide.No,
					price: Decimal.from("0.4"),
					size: Decimal.from("100"),
					realizedPnl: Decimal.from("30"),
					openedAt: 7000,
					closedAt: 8000,
				},
				{
					address: ethAddress("0x123"),
					conditionId: "cond5",
					side: MarketSide.Yes,
					price: Decimal.from("0.3"),
					size: Decimal.from("100"),
					realizedPnl: Decimal.from("70"),
					openedAt: 9000,
					closedAt: 10000,
				},
				{
					address: ethAddress("0x123"),
					conditionId: "cond6",
					side: MarketSide.No,
					price: Decimal.from("0.4"),
					size: Decimal.from("100"),
					realizedPnl: Decimal.from("30"),
					openedAt: 11000,
					closedAt: 12000,
				},
				{
					address: ethAddress("0x123"),
					conditionId: "cond7",
					side: MarketSide.Yes,
					price: Decimal.from("0.3"),
					size: Decimal.from("100"),
					realizedPnl: Decimal.from("70"),
					openedAt: 13000,
					closedAt: 14000,
				},
				{
					address: ethAddress("0x123"),
					conditionId: "cond8",
					side: MarketSide.No,
					price: Decimal.from("0.4"),
					size: Decimal.from("100"),
					realizedPnl: Decimal.from("30"),
					openedAt: 15000,
					closedAt: 16000,
				},
				{
					address: ethAddress("0x123"),
					conditionId: "cond9",
					side: MarketSide.Yes,
					price: Decimal.from("0.3"),
					size: Decimal.from("100"),
					realizedPnl: Decimal.from("70"),
					openedAt: 17000,
					closedAt: 18000,
				},
				{
					address: ethAddress("0x123"),
					conditionId: "cond10",
					side: MarketSide.No,
					price: Decimal.from("0.4"),
					size: Decimal.from("100"),
					realizedPnl: Decimal.from("30"),
					openedAt: 19000,
					closedAt: 20000,
				},
				{
					address: ethAddress("0x123"),
					conditionId: "cond11",
					side: MarketSide.No,
					price: Decimal.from("0.4"),
					size: Decimal.from("100"),
					realizedPnl: Decimal.from("-50"),
					openedAt: 21000,
					closedAt: 22000,
				},
			];

			const createResult = WalletProfiler.create({
				historyFetchFn: vi.fn().mockResolvedValue(ok(mockTrades)),
			});

			if (!createResult.ok) throw new Error("Failed to create profiler");
			const profiler = createResult.value;

			const profileResult = await profiler.profile(ethAddress("0x123"));
			if (!profileResult.ok) {
				throw new Error("Profile failed");
			}

			const categories = profiler.categorize(profileResult.value);

			expect(categories).toContain("momentum");
			expect(profileResult.value.largestLoss.toNumber()).toBeGreaterThan(0);
		});
	});

	describe("isEligibleForCopy", () => {
		it("returns true for eligible wallet", async () => {
			const mockTrades = [
				{
					address: ethAddress("0x123"),
					conditionId: "cond1",
					side: MarketSide.Yes,
					price: Decimal.from("0.6"),
					size: Decimal.from("100"),
					realizedPnl: Decimal.from("50"),
					openedAt: 1000,
					closedAt: 2000,
				},
				{
					address: ethAddress("0x123"),
					conditionId: "cond2",
					side: MarketSide.No,
					price: Decimal.from("0.4"),
					size: Decimal.from("100"),
					realizedPnl: Decimal.from("30"),
					openedAt: 3000,
					closedAt: 4000,
				},
			];

			const createResult = WalletProfiler.create({
				historyFetchFn: vi.fn().mockResolvedValue(ok(mockTrades)),
			});

			if (!createResult.ok) throw new Error("Failed to create profiler");
			const profiler = createResult.value;

			const result = await profiler.isEligibleForCopy(ethAddress("0x123"), {
				minWinRate: Decimal.from("0.4"),
				minTradeCount: 2,
			});

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBe(true);
			}
		});

		it("returns false for ineligible wallet", async () => {
			const mockTrades = [
				{
					address: ethAddress("0x123"),
					conditionId: "cond1",
					side: MarketSide.Yes,
					price: Decimal.from("0.6"),
					size: Decimal.from("100"),
					realizedPnl: Decimal.from("50"),
					openedAt: 1000,
					closedAt: 2000,
				},
			];

			const createResult = WalletProfiler.create({
				historyFetchFn: vi.fn().mockResolvedValue(ok(mockTrades)),
			});

			if (!createResult.ok) throw new Error("Failed to create profiler");
			const profiler = createResult.value;

			const result = await profiler.isEligibleForCopy(ethAddress("0x123"), {
				minWinRate: Decimal.from("0.8"),
				minTradeCount: 10,
			});

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBe(false);
			}
		});
	});
});
