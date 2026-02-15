import { describe, expect, it, vi } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { ethAddress } from "../shared/identifiers.js";
import { err, ok } from "../shared/result.js";
import { LeaderboardClient, type LeaderboardEntry, LeaderboardSortBy } from "./leaderboard.js";

describe("LeaderboardClient", () => {
	describe("factory", () => {
		it("creates client with default config", () => {
			const result = LeaderboardClient.create({
				baseUrl: "https://leaderboard.example.com",
			});
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBeDefined();
			}
		});

		it("returns err for empty baseUrl via Result", () => {
			const result = LeaderboardClient.create({
				baseUrl: "",
			});
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.message).toBe("baseUrl is required");
			}
		});
	});

	describe("fetchTopTraders", () => {
		it("returns Result.ok with sorted entries", async () => {
			const mockEntries: LeaderboardEntry[] = [
				{
					address: ethAddress("0x123"),
					winRate: Decimal.from("0.75"),
					totalPnl: Decimal.from("1000"),
					tradeCount: 50,
					categories: ["momentum"],
				},
				{
					address: ethAddress("0x456"),
					winRate: Decimal.from("0.65"),
					totalPnl: Decimal.from("500"),
					tradeCount: 30,
					categories: ["reversal"],
				},
			];

			const createResult = LeaderboardClient.create({
				baseUrl: "https://leaderboard.example.com",
				fetchFn: vi.fn().mockResolvedValue(ok(mockEntries)),
			});

			if (!createResult.ok) throw new Error("Failed to create client");
			const client = createResult.value;

			const result = await client.fetchTopTraders({ limit: 10 });

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toHaveLength(2);
			}
		});

		it("returns Result.err on network failure", async () => {
			const createResult = LeaderboardClient.create({
				baseUrl: "https://leaderboard.example.com",
				fetchFn: vi.fn().mockResolvedValue(err(new Error("Network error"))),
			});

			if (!createResult.ok) throw new Error("Failed to create client");
			const client = createResult.value;

			const result = await client.fetchTopTraders({ limit: 10 });

			expect(result.ok).toBe(false);
		});
	});

	describe("fetchByAddress", () => {
		it("returns Result.ok with single entry", async () => {
			const mockEntry: LeaderboardEntry = {
				address: ethAddress("0x123"),
				winRate: Decimal.from("0.75"),
				totalPnl: Decimal.from("1000"),
				tradeCount: 50,
				categories: ["momentum"],
			};

			const createResult = LeaderboardClient.create({
				baseUrl: "https://leaderboard.example.com",
				fetchFn: vi.fn().mockResolvedValue(ok([mockEntry])),
			});

			if (!createResult.ok) throw new Error("Failed to create client");
			const client = createResult.value;

			const result = await client.fetchByAddress(ethAddress("0x123"));

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value.address).toBe(ethAddress("0x123"));
			}
		});

		it("returns Result.err when trader not found", async () => {
			const createResult = LeaderboardClient.create({
				baseUrl: "https://leaderboard.example.com",
				fetchFn: vi.fn().mockResolvedValue(err(new Error("Not found"))),
			});

			if (!createResult.ok) throw new Error("Failed to create client");
			const client = createResult.value;

			const result = await client.fetchByAddress(ethAddress("0x999"));

			expect(result.ok).toBe(false);
		});
	});

	describe("filterByCategories", () => {
		it("filters entries by categories", async () => {
			const mockEntries: LeaderboardEntry[] = [
				{
					address: ethAddress("0x123"),
					winRate: Decimal.from("0.75"),
					totalPnl: Decimal.from("1000"),
					tradeCount: 50,
					categories: ["momentum"],
				},
				{
					address: ethAddress("0x456"),
					winRate: Decimal.from("0.65"),
					totalPnl: Decimal.from("500"),
					tradeCount: 30,
					categories: ["reversal"],
				},
			];

			const createResult = LeaderboardClient.create({
				baseUrl: "https://leaderboard.example.com",
				fetchFn: vi.fn().mockResolvedValue(ok(mockEntries)),
			});

			if (!createResult.ok) throw new Error("Failed to create client");
			const client = createResult.value;

			const result = await client.fetchTopTraders({
				limit: 10,
				categories: ["momentum"],
			});

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toHaveLength(1);
				expect(result.value[0]?.categories).toContain("momentum");
			}
		});
	});

	describe("sorting", () => {
		it("sorts by winRate descending by default", async () => {
			const mockEntries: LeaderboardEntry[] = [
				{
					address: ethAddress("0x123"),
					winRate: Decimal.from("0.50"),
					totalPnl: Decimal.from("100"),
					tradeCount: 10,
					categories: [],
				},
				{
					address: ethAddress("0x456"),
					winRate: Decimal.from("0.80"),
					totalPnl: Decimal.from("500"),
					tradeCount: 50,
					categories: [],
				},
			];

			const createResult = LeaderboardClient.create({
				baseUrl: "https://leaderboard.example.com",
				fetchFn: vi.fn().mockResolvedValue(ok(mockEntries)),
			});

			if (!createResult.ok) throw new Error("Failed to create client");
			const client = createResult.value;

			const result = await client.fetchTopTraders({
				limit: 10,
				sortBy: LeaderboardSortBy.WinRate,
			});

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value[0]?.winRate.toNumber()).toBe(0.8);
			}
		});

		it("sorts by totalPnl descending", async () => {
			const mockEntries: LeaderboardEntry[] = [
				{
					address: ethAddress("0x123"),
					winRate: Decimal.from("0.80"),
					totalPnl: Decimal.from("100"),
					tradeCount: 10,
					categories: [],
				},
				{
					address: ethAddress("0x456"),
					winRate: Decimal.from("0.50"),
					totalPnl: Decimal.from("1000"),
					tradeCount: 50,
					categories: [],
				},
			];

			const createResult = LeaderboardClient.create({
				baseUrl: "https://leaderboard.example.com",
				fetchFn: vi.fn().mockResolvedValue(ok(mockEntries)),
			});

			if (!createResult.ok) throw new Error("Failed to create client");
			const client = createResult.value;

			const result = await client.fetchTopTraders({
				limit: 10,
				sortBy: LeaderboardSortBy.TotalPnl,
			});

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value[0]?.totalPnl.toString()).toBe("1000");
			}
		});

		it("sorts by TradeCount", async () => {
			const mockEntries: LeaderboardEntry[] = [
				{
					address: ethAddress("0x123"),
					winRate: Decimal.from("0.80"),
					totalPnl: Decimal.from("100"),
					tradeCount: 10,
					categories: [],
				},
				{
					address: ethAddress("0x456"),
					winRate: Decimal.from("0.50"),
					totalPnl: Decimal.from("1000"),
					tradeCount: 50,
					categories: [],
				},
			];

			const createResult = LeaderboardClient.create({
				baseUrl: "https://leaderboard.example.com",
				fetchFn: vi.fn().mockResolvedValue(ok(mockEntries)),
			});

			if (!createResult.ok) throw new Error("Failed to create client");
			const client = createResult.value;

			const result = await client.fetchTopTraders({
				limit: 10,
				sortBy: LeaderboardSortBy.TradeCount,
			});

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value[0]?.tradeCount).toBe(50);
			}
		});

		it("limits results to requested count", async () => {
			const mockEntries: LeaderboardEntry[] = [
				{
					address: ethAddress("0x123"),
					winRate: Decimal.from("0.80"),
					totalPnl: Decimal.from("100"),
					tradeCount: 10,
					categories: [],
				},
				{
					address: ethAddress("0x456"),
					winRate: Decimal.from("0.70"),
					totalPnl: Decimal.from("200"),
					tradeCount: 20,
					categories: [],
				},
				{
					address: ethAddress("0x789"),
					winRate: Decimal.from("0.60"),
					totalPnl: Decimal.from("300"),
					tradeCount: 30,
					categories: [],
				},
			];

			const createResult = LeaderboardClient.create({
				baseUrl: "https://leaderboard.example.com",
				fetchFn: vi.fn().mockResolvedValue(ok(mockEntries)),
			});

			if (!createResult.ok) throw new Error("Failed to create client");
			const client = createResult.value;

			const result = await client.fetchTopTraders({
				limit: 2,
			});

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toHaveLength(2);
			}
		});
	});
});
