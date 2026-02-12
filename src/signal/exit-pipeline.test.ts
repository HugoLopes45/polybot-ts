import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { conditionId, marketTokenId } from "../shared/identifiers.js";
import { MarketSide } from "../shared/market-side.js";
import { ExitPipeline } from "./exit-pipeline.js";
import type { DetectorContextLike, ExitPolicy, PositionLike } from "./types.js";

// ── Stubs ───────────────────────────────────────────────────────────

const stubPosition: PositionLike = {
	conditionId: conditionId("cond-1"),
	tokenId: marketTokenId("tok-1"),
	side: MarketSide.Yes,
	entryPrice: Decimal.from("0.50"),
	size: Decimal.from("100"),
	highWaterMark: Decimal.from("0.60"),
	entryTimeMs: 1000,
	pnlTotal: (exit: Decimal) => exit.sub(Decimal.from("0.50")).mul(Decimal.from("100")),
	drawdown: () => Decimal.from("0.05"),
};

const stubCtx: DetectorContextLike = {
	conditionId: conditionId("cond-1"),
	nowMs: () => 10_000,
	spot: () => Decimal.from("0.55"),
	oraclePrice: () => Decimal.from("0.56"),
	timeRemainingMs: () => 300_000,
	bestBid: () => Decimal.from("0.54"),
	bestAsk: () => Decimal.from("0.56"),
	spread: () => Decimal.from("0.02"),
};

const alwaysExit: ExitPolicy = {
	name: "AlwaysExit",
	shouldExit: () => ({ type: "emergency", reason: "test" }),
};

const neverExit: ExitPolicy = {
	name: "NeverExit",
	shouldExit: () => null,
};

function takeProfitExit(roi: string): ExitPolicy {
	return {
		name: "TakeProfit",
		shouldExit: () => ({ type: "take_profit", roi: Decimal.from(roi) }),
	};
}

function stopLossExit(loss: string): ExitPolicy {
	return {
		name: "StopLoss",
		shouldExit: () => ({ type: "stop_loss", loss: Decimal.from(loss) }),
	};
}

// ── Tests ───────────────────────────────────────────────────────────

describe("ExitPipeline", () => {
	describe("construction", () => {
		it("starts empty", () => {
			const pipeline = ExitPipeline.create();
			expect(pipeline.isEmpty()).toBe(true);
			expect(pipeline.len()).toBe(0);
		});

		it("builds immutably with .with()", () => {
			const p1 = ExitPipeline.create();
			const p2 = p1.with(alwaysExit);
			expect(p1.isEmpty()).toBe(true);
			expect(p2.len()).toBe(1);
		});

		it("chains multiple .with() calls", () => {
			const pipeline = ExitPipeline.create().with(alwaysExit).with(neverExit);
			expect(pipeline.len()).toBe(2);
		});

		it("reports policy names", () => {
			const pipeline = ExitPipeline.create().with(alwaysExit).with(neverExit);
			expect(pipeline.policyNames()).toEqual(["AlwaysExit", "NeverExit"]);
		});
	});

	describe("evaluate — OR semantics", () => {
		it("returns null when empty", () => {
			const pipeline = ExitPipeline.create();
			expect(pipeline.evaluate(stubPosition, stubCtx)).toBeNull();
		});

		it("returns null when all policies say no", () => {
			const pipeline = ExitPipeline.create().with(neverExit).with(neverExit);
			expect(pipeline.evaluate(stubPosition, stubCtx)).toBeNull();
		});

		it("returns first triggering exit (OR semantics)", () => {
			const pipeline = ExitPipeline.create()
				.with(neverExit)
				.with(takeProfitExit("0.10"))
				.with(stopLossExit("0.05"));

			const result = pipeline.evaluate(stubPosition, stubCtx);
			expect(result).not.toBeNull();
			expect(result?.type).toBe("take_profit");
		});

		it("short-circuits on first match", () => {
			let secondCalled = false;
			const spy: ExitPolicy = {
				name: "Spy",
				shouldExit: () => {
					secondCalled = true;
					return { type: "stop_loss", loss: Decimal.from("0.03") };
				},
			};

			const pipeline = ExitPipeline.create().with(alwaysExit).with(spy);
			pipeline.evaluate(stubPosition, stubCtx);
			expect(secondCalled).toBe(false);
		});

		it("tries all policies before returning null", () => {
			let callCount = 0;
			const counter: ExitPolicy = {
				name: "Counter",
				shouldExit: () => {
					callCount++;
					return null;
				},
			};

			ExitPipeline.create()
				.with(counter)
				.with(counter)
				.with(counter)
				.evaluate(stubPosition, stubCtx);
			expect(callCount).toBe(3);
		});
	});

	describe("presets", () => {
		it("standard() has take-profit, stop-loss, trailing-stop, time-exit", () => {
			const pipeline = ExitPipeline.standard();
			expect(pipeline.len()).toBeGreaterThanOrEqual(4);
			const names = pipeline.policyNames();
			expect(names).toContain("TakeProfit");
			expect(names).toContain("StopLoss");
			expect(names).toContain("TrailingStop");
			expect(names).toContain("TimeExit");
		});

		it("conservative() includes near-expiry exit", () => {
			const pipeline = ExitPipeline.conservative();
			const names = pipeline.policyNames();
			expect(names).toContain("NearExpiry");
			expect(names).toContain("StopLoss");
		});

		it("aggressive() has wider thresholds (more policies)", () => {
			const pipeline = ExitPipeline.aggressive();
			expect(pipeline.len()).toBeGreaterThanOrEqual(3);
		});

		it("minimal() has at most 2 policies", () => {
			const pipeline = ExitPipeline.minimal();
			expect(pipeline.len()).toBeLessThanOrEqual(2);
		});
	});

	describe("requireExits fallback", () => {
		it("returns self if non-empty", () => {
			const pipeline = ExitPipeline.create().with(alwaysExit);
			const result = pipeline.requireExits();
			expect(result.len()).toBe(1);
		});

		it("falls back to minimal() if empty", () => {
			const pipeline = ExitPipeline.create();
			const result = pipeline.requireExits();
			expect(result.isEmpty()).toBe(false);
		});
	});
});
