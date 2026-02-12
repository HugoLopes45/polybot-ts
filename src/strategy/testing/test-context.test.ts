import { describe, expect, it } from "vitest";
import { StrategyState } from "../../lifecycle/types.js";
import { Decimal } from "../../shared/decimal.js";
import { conditionId } from "../../shared/identifiers.js";
import { MarketSide } from "../../shared/market-side.js";
import { FakeClock } from "../../shared/time.js";
import { TestContextBuilder } from "./test-context.js";

describe("TestContextBuilder", () => {
	const defaultConditionId = conditionId("test-condition-123");

	describe("defaults", () => {
		it("should create context with sensible defaults", () => {
			const ctx = new TestContextBuilder().build();

			expect(ctx.conditionId).toBe(defaultConditionId);
			expect(ctx.state()).toBe(StrategyState.Active);
			expect(ctx.availableBalance().toNumber()).toBe(1000);
			expect(ctx.positions()).toHaveLength(0);
			expect(ctx.oraclePrice()).toBeNull();
			expect(ctx.bestBid(MarketSide.Yes)).toBeNull();
			expect(ctx.bestAsk(MarketSide.Yes)).toBeNull();
		});
	});

	describe("withBestBid", () => {
		it("should set best bid for a given side", () => {
			const price = Decimal.from(0.45);
			const ctx = new TestContextBuilder().withBestBid(MarketSide.Yes, price).build();

			expect(ctx.bestBid(MarketSide.Yes)?.toNumber()).toBe(0.45);
		});

		it("should allow different bids per side", () => {
			const yesBid = Decimal.from(0.42);
			const noBid = Decimal.from(0.58);
			const ctx = new TestContextBuilder()
				.withBestBid(MarketSide.Yes, yesBid)
				.withBestBid(MarketSide.No, noBid)
				.build();

			expect(ctx.bestBid(MarketSide.Yes)?.toNumber()).toBe(0.42);
			expect(ctx.bestBid(MarketSide.No)?.toNumber()).toBe(0.58);
		});
	});

	describe("withBestAsk", () => {
		it("should set best ask for a given side", () => {
			const price = Decimal.from(0.55);
			const ctx = new TestContextBuilder().withBestAsk(MarketSide.Yes, price).build();

			expect(ctx.bestAsk(MarketSide.Yes)?.toNumber()).toBe(0.55);
		});
	});

	describe("withOraclePrice", () => {
		it("should set oracle price", () => {
			const price = Decimal.from(0.5);
			const ctx = new TestContextBuilder().withOraclePrice(price).build();

			expect(ctx.oraclePrice()?.toNumber()).toBe(0.5);
		});
	});

	describe("withPositions", () => {
		it("should set positions", () => {
			const ctx = new TestContextBuilder().withPositions([]).build();

			expect(ctx.positions()).toHaveLength(0);
		});
	});

	describe("withState", () => {
		it("should override default state", () => {
			const ctx = new TestContextBuilder().withState(StrategyState.Paused).build();

			expect(ctx.state()).toBe(StrategyState.Paused);
		});
	});

	describe("withBalance", () => {
		it("should override default balance", () => {
			const balance = Decimal.from(5000);
			const ctx = new TestContextBuilder().withBalance(balance).build();

			expect(ctx.availableBalance().toNumber()).toBe(5000);
		});
	});

	describe("atTime", () => {
		it("should set clock to specific time", () => {
			const clock = new FakeClock(1000);
			const ctx = new TestContextBuilder().atTime(clock).build();

			expect(ctx.nowMs()).toBe(1000);
		});
	});

	describe("build immutability", () => {
		it("should return independent instances", () => {
			const builder = new TestContextBuilder();
			const ctx1 = builder.withBestBid(MarketSide.Yes, Decimal.from(0.4)).build();
			const ctx2 = builder.withBestBid(MarketSide.Yes, Decimal.from(0.6)).build();

			expect(ctx1.bestBid(MarketSide.Yes)?.toNumber()).toBe(0.4);
			expect(ctx2.bestBid(MarketSide.Yes)?.toNumber()).toBe(0.6);
		});
	});
});
