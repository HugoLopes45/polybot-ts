import { describe, expect, it } from "vitest";
import { StrategyState } from "../lifecycle/types.js";
import { SdkPosition } from "../position/sdk-position.js";
import { Decimal } from "../shared/decimal.js";
import { conditionId, marketTokenId } from "../shared/identifiers.js";
import { MarketSide } from "../shared/market-side.js";
import { DetectorContext } from "./detector-context.js";

const d = Decimal.from;

function createContext(): DetectorContext {
	const pos = SdkPosition.open({
		conditionId: conditionId("cond-1"),
		tokenId: marketTokenId("tok-1"),
		side: MarketSide.Yes,
		entryPrice: d("0.50"),
		size: d("100"),
		entryTimeMs: 1000,
	});

	return DetectorContext.create({
		conditionId: conditionId("cond-1"),
		bestBid: d("0.54"),
		bestAsk: d("0.56"),
		oraclePrice: d("0.55"),
		oracleAgeMs: 500,
		timeRemainingMs: 300_000,
		positions: [pos],
		state: StrategyState.Active,
		dailyPnl: d("-10"),
		consecutiveLosses: 1,
		availableBalance: d("1000"),
	});
}

describe("DetectorContext", () => {
	it("provides market view data", () => {
		const ctx = createContext();
		expect(ctx.bestBid(MarketSide.Yes)?.eq(d("0.54"))).toBe(true);
		expect(ctx.bestAsk(MarketSide.Yes)?.eq(d("0.56"))).toBe(true);
		expect(ctx.spread(MarketSide.Yes)?.eq(d("0.02"))).toBe(true);
		expect(ctx.timeRemainingMs()).toBe(300_000);
	});

	it("provides position view data", () => {
		const ctx = createContext();
		expect(ctx.positions().length).toBe(1);
		expect(ctx.hasPosition(conditionId("cond-1"))).toBe(true);
		expect(ctx.hasPosition(conditionId("cond-2"))).toBe(false);
		expect(ctx.openCount()).toBe(1);
	});

	it("provides oracle view data", () => {
		const ctx = createContext();
		expect(ctx.oraclePrice()?.eq(d("0.55"))).toBe(true);
		expect(ctx.oracleAgeMs()).toBe(500);
		expect(ctx.oracleIsFresh(1000)).toBe(true);
		expect(ctx.oracleIsFresh(100)).toBe(false);
	});

	it("provides state view data", () => {
		const ctx = createContext();
		expect(ctx.state()).toBe(StrategyState.Active);
		expect(ctx.canOpen()).toBe(true);
		expect(ctx.canClose()).toBe(true);
	});

	it("provides risk view data", () => {
		const ctx = createContext();
		expect(ctx.dailyPnl().eq(d("-10"))).toBe(true);
		expect(ctx.consecutiveLosses()).toBe(1);
		expect(ctx.availableBalance().eq(d("1000"))).toBe(true);
	});

	it("spread returns null when bid or ask missing", () => {
		const ctx = DetectorContext.create({
			conditionId: conditionId("cond-1"),
			bestBid: null,
			bestAsk: d("0.56"),
			oraclePrice: null,
			oracleAgeMs: null,
			timeRemainingMs: 300_000,
			positions: [],
			state: StrategyState.Active,
			dailyPnl: d("0"),
			consecutiveLosses: 0,
			availableBalance: d("1000"),
		});
		expect(ctx.spread(MarketSide.Yes)).toBeNull();
	});

	it("computes spreadPct correctly", () => {
		const ctx = createContext();
		const pct = ctx.spreadPct(MarketSide.Yes);
		expect(pct).not.toBeNull();
		// spread = 0.02, mid = 0.55, pct = (0.02/0.55)*100 ≈ 3.636
		expect(pct).toBeGreaterThan(3.6);
		expect(pct).toBeLessThan(3.7);
	});

	it("spreadPct returns null when bid missing", () => {
		const ctx = DetectorContext.create({
			conditionId: conditionId("cond-1"),
			bestBid: null,
			bestAsk: d("0.56"),
			oraclePrice: null,
			oracleAgeMs: null,
			timeRemainingMs: 300_000,
			positions: [],
			state: StrategyState.Active,
			dailyPnl: d("0"),
			consecutiveLosses: 0,
			availableBalance: d("1000"),
		});
		expect(ctx.spreadPct(MarketSide.Yes)).toBeNull();
	});

	it("canOpen is false in non-Active states", () => {
		for (const state of [StrategyState.Paused, StrategyState.ClosingOnly, StrategyState.Halted]) {
			const ctx = DetectorContext.create({
				conditionId: conditionId("cond-1"),
				bestBid: d("0.54"),
				bestAsk: d("0.56"),
				oraclePrice: null,
				oracleAgeMs: null,
				timeRemainingMs: 300_000,
				positions: [],
				state,
				dailyPnl: d("0"),
				consecutiveLosses: 0,
				availableBalance: d("1000"),
			});
			expect(ctx.canOpen()).toBe(false);
		}
	});

	it("canClose is true in Active/Paused/ClosingOnly", () => {
		for (const state of [StrategyState.Active, StrategyState.Paused, StrategyState.ClosingOnly]) {
			const ctx = DetectorContext.create({
				conditionId: conditionId("cond-1"),
				bestBid: d("0.54"),
				bestAsk: d("0.56"),
				oraclePrice: null,
				oracleAgeMs: null,
				timeRemainingMs: 300_000,
				positions: [],
				state,
				dailyPnl: d("0"),
				consecutiveLosses: 0,
				availableBalance: d("1000"),
			});
			expect(ctx.canClose()).toBe(true);
		}
	});

	it("canClose is false in Halted", () => {
		const ctx = DetectorContext.create({
			conditionId: conditionId("cond-1"),
			bestBid: d("0.54"),
			bestAsk: d("0.56"),
			oraclePrice: null,
			oracleAgeMs: null,
			timeRemainingMs: 300_000,
			positions: [],
			state: StrategyState.Halted,
			dailyPnl: d("0"),
			consecutiveLosses: 0,
			availableBalance: d("1000"),
		});
		expect(ctx.canClose()).toBe(false);
	});

	it("uses injected Clock for nowMs", () => {
		const ctx = DetectorContext.create({
			conditionId: conditionId("cond-1"),
			clock: { now: () => 42_000 },
			bestBid: d("0.54"),
			bestAsk: d("0.56"),
			oraclePrice: null,
			oracleAgeMs: null,
			timeRemainingMs: 300_000,
			positions: [],
			state: StrategyState.Active,
			dailyPnl: d("0"),
			consecutiveLosses: 0,
			availableBalance: d("1000"),
		});
		expect(ctx.nowMs()).toBe(42_000);
	});

	it("provides per-side book data", () => {
		const ctx = DetectorContext.create({
			conditionId: conditionId("cond-1"),
			book: {
				[MarketSide.Yes]: { bid: d("0.54"), ask: d("0.56") },
				[MarketSide.No]: { bid: d("0.44"), ask: d("0.46") },
			},
			oraclePrice: null,
			oracleAgeMs: null,
			timeRemainingMs: 300_000,
			positions: [],
			state: StrategyState.Active,
			dailyPnl: d("0"),
			consecutiveLosses: 0,
			availableBalance: d("1000"),
		});
		expect(ctx.bestBid(MarketSide.Yes)?.eq(d("0.54"))).toBe(true);
		expect(ctx.bestAsk(MarketSide.No)?.eq(d("0.46"))).toBe(true);
		expect(ctx.spread(MarketSide.No)?.eq(d("0.02"))).toBe(true);
	});

	it("totalNotional sums across positions", () => {
		const pos1 = SdkPosition.open({
			conditionId: conditionId("cond-1"),
			tokenId: marketTokenId("tok-1"),
			side: MarketSide.Yes,
			entryPrice: d("0.50"),
			size: d("100"),
			entryTimeMs: 1000,
		});
		const pos2 = SdkPosition.open({
			conditionId: conditionId("cond-2"),
			tokenId: marketTokenId("tok-2"),
			side: MarketSide.No,
			entryPrice: d("0.40"),
			size: d("200"),
			entryTimeMs: 2000,
		});

		const ctx = DetectorContext.create({
			conditionId: conditionId("cond-1"),
			bestBid: d("0.54"),
			bestAsk: d("0.56"),
			oraclePrice: null,
			oracleAgeMs: null,
			timeRemainingMs: 300_000,
			positions: [pos1, pos2],
			state: StrategyState.Active,
			dailyPnl: d("0"),
			consecutiveLosses: 0,
			availableBalance: d("1000"),
		});
		// notional = 0.50*100 + 0.40*200 = 50 + 80 = 130
		expect(ctx.totalNotional().eq(d("130"))).toBe(true);
	});
});
