import { describe, expect, it } from "vitest";
import { ErrorCategory } from "../shared/errors.js";
import { conditionId } from "../shared/identifiers.js";
import { isErr, isOk } from "../shared/result.js";
import { FakeClock } from "../shared/time.js";
import { MarketService } from "./market-service.js";
import type { MarketInfo } from "./types.js";

const MARKET_A: MarketInfo = {
	conditionId: conditionId("cond-a"),
	questionId: "q-1",
	question: "Will it rain?",
	description: "Weather market",
	active: true,
	closed: false,
	endDate: "2025-12-31",
};

const MARKET_B: MarketInfo = {
	conditionId: conditionId("cond-b"),
	questionId: "q-2",
	question: "Will it snow?",
	description: "Snow market",
	active: true,
	closed: false,
	endDate: "2025-12-31",
};

describe("MarketService", () => {
	describe("getMarket", () => {
		it("returns ok with market info from deps", async () => {
			const deps = {
				getMarket: async () => MARKET_A,
				searchMarkets: async () => [],
			};
			const service = new MarketService(deps);

			const result = await service.getMarket(conditionId("cond-a"));

			expect(isOk(result)).toBe(true);
			if (isOk(result)) {
				expect(result.value.question).toBe("Will it rain?");
			}
		});

		it("returns err when market not found", async () => {
			const deps = {
				getMarket: async () => null,
				searchMarkets: async () => [],
			};
			const service = new MarketService(deps);

			const result = await service.getMarket(conditionId("cond-missing"));

			expect(isErr(result)).toBe(true);
			if (isErr(result)) {
				expect(result.error.code).toBe("MARKET_NOT_FOUND");
				expect(result.error.category).toBe(ErrorCategory.NonRetryable);
			}
		});

		it("caches result — second call does not hit deps", async () => {
			let callCount = 0;
			const deps = {
				getMarket: async () => {
					callCount++;
					return MARKET_A;
				},
				searchMarkets: async () => [],
			};
			const clock = new FakeClock(1000);
			const service = new MarketService(deps, { clock, cacheTtlMs: 60_000 });

			await service.getMarket(conditionId("cond-a"));
			await service.getMarket(conditionId("cond-a"));

			expect(callCount).toBe(1);
		});

		it("cache expires after TTL — call after advance hits deps again", async () => {
			let callCount = 0;
			const deps = {
				getMarket: async () => {
					callCount++;
					return MARKET_A;
				},
				searchMarkets: async () => [],
			};
			const clock = new FakeClock(1000);
			const service = new MarketService(deps, { clock, cacheTtlMs: 5_000 });

			await service.getMarket(conditionId("cond-a"));
			clock.advance(6_000);
			await service.getMarket(conditionId("cond-a"));

			expect(callCount).toBe(2);
		});
	});

	describe("searchMarkets", () => {
		it("returns ok with list from deps", async () => {
			const deps = {
				getMarket: async () => null,
				searchMarkets: async () => [MARKET_A, MARKET_B],
			};
			const service = new MarketService(deps);

			const result = await service.searchMarkets("weather");

			expect(isOk(result)).toBe(true);
			if (isOk(result)) {
				expect(result.value).toHaveLength(2);
				expect(result.value[0]?.question).toBe("Will it rain?");
			}
		});

		it("returns err when deps throw", async () => {
			const deps = {
				getMarket: async () => null,
				searchMarkets: async (): Promise<MarketInfo[]> => {
					throw new Error("connection refused via econnrefused");
				},
			};
			const service = new MarketService(deps);

			const result = await service.searchMarkets("weather");

			expect(isErr(result)).toBe(true);
			if (isErr(result)) {
				expect(result.error.category).toBe(ErrorCategory.Retryable);
			}
		});
	});
});
