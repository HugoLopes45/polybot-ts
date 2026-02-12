import { describe, expect, it } from "vitest";
import { Decimal } from "../../shared/decimal.js";
import { conditionId, marketTokenId } from "../../shared/identifiers.js";
import { MarketSide } from "../../shared/market-side.js";
import type { DetectorContextLike, PositionLike } from "../types.js";
import { EdgeReversalExit } from "./edge-reversal.js";
import { EmergencyExit } from "./emergency.js";
import { NearExpiryExit } from "./near-expiry.js";
import { StopLossExit } from "./stop-loss.js";
import { TakeProfitExit } from "./take-profit.js";
import { TimeExit } from "./time-exit.js";
import { TrailingStopExit } from "./trailing-stop.js";

// ── Helpers ─────────────────────────────────────────────────────────

function makePosition(
	overrides: Partial<{
		side: MarketSide;
		entryPrice: string;
		size: string;
		hwm: string;
		entryTimeMs: number;
		pnlFn: (exit: Decimal) => Decimal;
		drawdownFn: (price: Decimal) => Decimal;
	}> = {},
): PositionLike {
	const entryPrice = Decimal.from(overrides.entryPrice ?? "0.50");
	const size = Decimal.from(overrides.size ?? "100");
	return {
		conditionId: conditionId("cond-1"),
		tokenId: marketTokenId("tok-1"),
		side: overrides.side ?? MarketSide.Yes,
		entryPrice,
		size,
		highWaterMark: Decimal.from(overrides.hwm ?? "0.60"),
		entryTimeMs: overrides.entryTimeMs ?? 1000,
		pnlTotal: overrides.pnlFn ?? ((exit: Decimal) => exit.sub(entryPrice).mul(size)),
		drawdown: overrides.drawdownFn ?? (() => Decimal.from("0.05")),
	};
}

function makeCtx(
	overrides: Partial<{
		bidPrice: string | null;
		oraclePrice: string | null;
		timeRemainingMs: number;
		spreadPct: string | null;
	}> = {},
): DetectorContextLike {
	return {
		conditionId: conditionId("cond-1"),
		nowMs: () => 10_000,
		spot: () => Decimal.from("0.55"),
		oraclePrice: () =>
			overrides.oraclePrice !== undefined
				? overrides.oraclePrice === null
					? null
					: Decimal.from(overrides.oraclePrice)
				: Decimal.from("0.55"),
		timeRemainingMs: () => overrides.timeRemainingMs ?? 300_000,
		bestBid: () =>
			overrides.bidPrice !== undefined
				? overrides.bidPrice === null
					? null
					: Decimal.from(overrides.bidPrice)
				: Decimal.from("0.55"),
		bestAsk: () => Decimal.from("0.56"),
		spread: () =>
			overrides.spreadPct !== undefined
				? overrides.spreadPct === null
					? null
					: Decimal.from(overrides.spreadPct)
				: Decimal.from("0.02"),
	};
}

// ── TakeProfitExit ──────────────────────────────────────────────────

describe("TakeProfitExit", () => {
	it("triggers when ROI exceeds target", () => {
		const exit = TakeProfitExit.fromPct(10);
		const pos = makePosition({ entryPrice: "0.50" });
		const ctx = makeCtx({ bidPrice: "0.60" });
		const result = exit.shouldExit(pos, ctx);
		expect(result).not.toBeNull();
		expect(result?.type).toBe("take_profit");
	});

	it("does not trigger when ROI below target", () => {
		const exit = TakeProfitExit.fromPct(10);
		const pos = makePosition({ entryPrice: "0.50" });
		const ctx = makeCtx({ bidPrice: "0.54" });
		expect(exit.shouldExit(pos, ctx)).toBeNull();
	});

	it("returns null when no bid available", () => {
		const exit = TakeProfitExit.normal();
		const pos = makePosition();
		const ctx = makeCtx({ bidPrice: null });
		expect(exit.shouldExit(pos, ctx)).toBeNull();
	});

	it("factory presets create valid instances", () => {
		expect(TakeProfitExit.small().name).toBe("TakeProfit");
		expect(TakeProfitExit.normal().name).toBe("TakeProfit");
		expect(TakeProfitExit.large().name).toBe("TakeProfit");
	});
});

// ── StopLossExit ────────────────────────────────────────────────────

describe("StopLossExit", () => {
	it("triggers when loss exceeds threshold", () => {
		const exit = StopLossExit.fromPct(5);
		const pos = makePosition({ entryPrice: "0.50" });
		const ctx = makeCtx({ bidPrice: "0.44" });
		const result = exit.shouldExit(pos, ctx);
		expect(result).not.toBeNull();
		expect(result?.type).toBe("stop_loss");
	});

	it("does not trigger when within tolerance", () => {
		const exit = StopLossExit.fromPct(5);
		const pos = makePosition({ entryPrice: "0.50" });
		const ctx = makeCtx({ bidPrice: "0.49" });
		expect(exit.shouldExit(pos, ctx)).toBeNull();
	});

	it("factory presets create valid instances", () => {
		expect(StopLossExit.tight().name).toBe("StopLoss");
		expect(StopLossExit.normal().name).toBe("StopLoss");
		expect(StopLossExit.wide().name).toBe("StopLoss");
	});
});

// ── TrailingStopExit ────────────────────────────────────────────────

describe("TrailingStopExit", () => {
	it("triggers when drawdown exceeds trail percentage", () => {
		const exit = TrailingStopExit.fromPct(5);
		const pos = makePosition({ drawdownFn: () => Decimal.from("0.08") });
		const ctx = makeCtx();
		const result = exit.shouldExit(pos, ctx);
		expect(result).not.toBeNull();
		expect(result?.type).toBe("trailing_stop");
	});

	it("does not trigger when drawdown within trail", () => {
		const exit = TrailingStopExit.fromPct(10);
		const pos = makePosition({ drawdownFn: () => Decimal.from("0.05") });
		const ctx = makeCtx();
		expect(exit.shouldExit(pos, ctx)).toBeNull();
	});

	it("returns null when no bid available", () => {
		const exit = TrailingStopExit.normal();
		const pos = makePosition();
		const ctx = makeCtx({ bidPrice: null });
		expect(exit.shouldExit(pos, ctx)).toBeNull();
	});
});

// ── TimeExit ────────────────────────────────────────────────────────

describe("TimeExit", () => {
	it("triggers when time remaining is below threshold", () => {
		const exit = TimeExit.fromMins(5);
		const ctx = makeCtx({ timeRemainingMs: 120_000 });
		const result = exit.shouldExit(makePosition(), ctx);
		expect(result).not.toBeNull();
		expect(result?.type).toBe("time_exit");
	});

	it("does not trigger when sufficient time remains", () => {
		const exit = TimeExit.fromMins(5);
		const ctx = makeCtx({ timeRemainingMs: 600_000 });
		expect(exit.shouldExit(makePosition(), ctx)).toBeNull();
	});

	it("triggers at exact boundary", () => {
		const exit = TimeExit.fromSecs(60);
		const ctx = makeCtx({ timeRemainingMs: 60_000 });
		expect(exit.shouldExit(makePosition(), ctx)).not.toBeNull();
	});
});

// ── EdgeReversalExit ────────────────────────────────────────────────

describe("EdgeReversalExit", () => {
	it("triggers for YES when oracle drops below entry minus threshold", () => {
		const exit = EdgeReversalExit.fromPct(5);
		const pos = makePosition({ side: MarketSide.Yes, entryPrice: "0.50" });
		const ctx = makeCtx({ oraclePrice: "0.40" });
		const result = exit.shouldExit(pos, ctx);
		expect(result).not.toBeNull();
		expect(result?.type).toBe("edge_reversal");
	});

	it("does not trigger for YES when oracle is close to entry", () => {
		const exit = EdgeReversalExit.fromPct(5);
		const pos = makePosition({ side: MarketSide.Yes, entryPrice: "0.50" });
		const ctx = makeCtx({ oraclePrice: "0.48" });
		expect(exit.shouldExit(pos, ctx)).toBeNull();
	});

	it("triggers for NO when oracle rises above complement plus threshold", () => {
		const exit = EdgeReversalExit.fromPct(5);
		const pos = makePosition({ side: MarketSide.No, entryPrice: "0.40" });
		const ctx = makeCtx({ oraclePrice: "0.70" });
		const result = exit.shouldExit(pos, ctx);
		expect(result).not.toBeNull();
		expect(result?.type).toBe("edge_reversal");
	});

	it("returns null when oracle unavailable", () => {
		const exit = EdgeReversalExit.normal();
		const ctx = makeCtx({ oraclePrice: null });
		expect(exit.shouldExit(makePosition(), ctx)).toBeNull();
	});
});

// ── NearExpiryExit ──────────────────────────────────────────────────

describe("NearExpiryExit", () => {
	it("triggers when close to expiry", () => {
		const exit = NearExpiryExit.fromSecs(60);
		const ctx = makeCtx({ timeRemainingMs: 30_000 });
		const result = exit.shouldExit(makePosition(), ctx);
		expect(result).not.toBeNull();
		expect(result?.type).toBe("near_expiry");
	});

	it("does not trigger when far from expiry", () => {
		const exit = NearExpiryExit.fromSecs(60);
		const ctx = makeCtx({ timeRemainingMs: 120_000 });
		expect(exit.shouldExit(makePosition(), ctx)).toBeNull();
	});
});

// ── EmergencyExit ───────────────────────────────────────────────────

describe("EmergencyExit", () => {
	it("triggers on low time remaining", () => {
		const exit = EmergencyExit.create({ minTimeRemainingMs: 60_000 });
		const ctx = makeCtx({ timeRemainingMs: 30_000 });
		const result = exit.shouldExit(makePosition(), ctx);
		expect(result).not.toBeNull();
		expect(result?.type).toBe("emergency");
	});

	it("triggers on high spread", () => {
		const exit = EmergencyExit.create({ maxSpreadPct: 0.05 });
		const ctx = makeCtx({ spreadPct: "0.10" });
		const result = exit.shouldExit(makePosition(), ctx);
		expect(result).not.toBeNull();
		expect(result?.type).toBe("emergency");
	});

	it("triggers on max hold time exceeded", () => {
		const exit = EmergencyExit.create({ maxHoldTimeMs: 5_000 });
		const pos = makePosition({ entryTimeMs: 1_000 });
		const ctx: DetectorContextLike = {
			...makeCtx(),
			nowMs: () => 7_000,
		};
		const result = exit.shouldExit(pos, ctx);
		expect(result).not.toBeNull();
		expect(result?.type).toBe("emergency");
	});

	it("does not trigger when hold time within limit", () => {
		const exit = EmergencyExit.create({ maxHoldTimeMs: 10_000 });
		const pos = makePosition({ entryTimeMs: 1_000 });
		const ctx: DetectorContextLike = {
			...makeCtx(),
			nowMs: () => 5_000,
		};
		expect(exit.shouldExit(pos, ctx)).toBeNull();
	});

	it("does not trigger when all within bounds", () => {
		const exit = EmergencyExit.create({ minTimeRemainingMs: 60_000 });
		const ctx = makeCtx({ timeRemainingMs: 120_000 });
		expect(exit.shouldExit(makePosition(), ctx)).toBeNull();
	});

	it("factory presets create valid instances", () => {
		expect(EmergencyExit.conservative().name).toBe("Emergency");
		expect(EmergencyExit.aggressive().name).toBe("Emergency");
	});
});
