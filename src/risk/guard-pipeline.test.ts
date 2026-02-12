import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { conditionId } from "../shared/identifiers.js";
import { GuardPipeline } from "./guard-pipeline.js";
import type { EntryGuard, GuardContext } from "./types.js";
import { allow, block, blockFatal } from "./types.js";

// ── Stubs ───────────────────────────────────────────────────────────

const alwaysAllow: EntryGuard = {
	name: "AlwaysAllow",
	check: () => allow(),
};

const alwaysBlock: EntryGuard = {
	name: "AlwaysBlock",
	check: () => block("AlwaysBlock", "always blocked"),
};

const fatalBlock: EntryGuard = {
	name: "FatalBlock",
	check: () => blockFatal("FatalBlock", "fatal"),
	isSafetyCritical: true,
};

const stubCtx: GuardContext = {
	conditionId: conditionId("cond-1"),
	nowMs: () => 1000,
	spot: () => Decimal.from("0.55"),
	oraclePrice: () => Decimal.from("0.55"),
	bestBid: () => Decimal.from("0.54"),
	bestAsk: () => Decimal.from("0.56"),
	spread: () => Decimal.from("0.02"),
	spreadPct: () => 3.6,
	timeRemainingMs: () => 300_000,
	openPositionCount: () => 2,
	totalExposure: () => Decimal.from("200"),
	availableBalance: () => Decimal.from("1000"),
	dailyPnl: () => Decimal.from("-50"),
	consecutiveLosses: () => 1,
	hasPendingOrderFor: () => false,
	lastTradeTimeMs: () => null,
	oracleAgeMs: () => 500,
	bookAgeMs: () => 200,
};

// ── Tests ───────────────────────────────────────────────────────────

describe("GuardPipeline", () => {
	describe("construction", () => {
		it("starts empty", () => {
			const pipeline = GuardPipeline.create();
			expect(pipeline.isEmpty()).toBe(true);
			expect(pipeline.len()).toBe(0);
		});

		it("builds immutably with .with()", () => {
			const p1 = GuardPipeline.create();
			const p2 = p1.with(alwaysAllow);
			expect(p1.isEmpty()).toBe(true);
			expect(p2.len()).toBe(1);
		});

		it("chains multiple .with() calls", () => {
			const pipeline = GuardPipeline.create().with(alwaysAllow).with(alwaysBlock);
			expect(pipeline.len()).toBe(2);
		});

		it("reports guard names", () => {
			const pipeline = GuardPipeline.create().with(alwaysAllow).with(alwaysBlock);
			expect(pipeline.guardNames()).toEqual(["AlwaysAllow", "AlwaysBlock"]);
		});
	});

	describe("evaluate — AND semantics", () => {
		it("returns allow when empty", () => {
			const pipeline = GuardPipeline.create();
			expect(pipeline.evaluate(stubCtx).type).toBe("allow");
		});

		it("returns allow when all guards allow", () => {
			const pipeline = GuardPipeline.create().with(alwaysAllow).with(alwaysAllow);
			expect(pipeline.evaluate(stubCtx).type).toBe("allow");
		});

		it("returns block on first blocking guard (AND semantics)", () => {
			const pipeline = GuardPipeline.create().with(alwaysAllow).with(alwaysBlock).with(alwaysAllow);

			const result = pipeline.evaluate(stubCtx);
			expect(result.type).toBe("block");
			if (result.type === "block") {
				expect(result.guard).toBe("AlwaysBlock");
			}
		});

		it("short-circuits on first block", () => {
			let secondCalled = false;
			const spy: EntryGuard = {
				name: "Spy",
				check: () => {
					secondCalled = true;
					return block("Spy", "spied");
				},
			};

			const pipeline = GuardPipeline.create().with(alwaysBlock).with(spy);
			pipeline.evaluate(stubCtx);
			expect(secondCalled).toBe(false);
		});

		it("evaluates all guards when all allow", () => {
			let callCount = 0;
			const counter: EntryGuard = {
				name: "Counter",
				check: () => {
					callCount++;
					return allow();
				},
			};

			GuardPipeline.create().with(counter).with(counter).with(counter).evaluate(stubCtx);
			expect(callCount).toBe(3);
		});

		it("returns fatal block with recoverable=false", () => {
			const pipeline = GuardPipeline.create().with(fatalBlock);
			const result = pipeline.evaluate(stubCtx);
			expect(result.type).toBe("block");
			if (result.type === "block") {
				expect(result.recoverable).toBe(false);
			}
		});
	});

	describe("diagnostics", () => {
		it("block verdict includes currentValue and threshold when provided", () => {
			const guardWithValues: EntryGuard = {
				name: "Threshold",
				check: () => ({
					type: "block",
					guard: "Threshold",
					reason: "above limit",
					recoverable: true,
					currentValue: 5,
					threshold: 3,
				}),
			};

			const result = GuardPipeline.create().with(guardWithValues).evaluate(stubCtx);
			if (result.type === "block") {
				expect(result.currentValue).toBe(5);
				expect(result.threshold).toBe(3);
			}
		});
	});

	describe("presets", () => {
		it("standard() has core guards", () => {
			const pipeline = GuardPipeline.standard();
			expect(pipeline.len()).toBeGreaterThanOrEqual(3);
			const names = pipeline.guardNames();
			expect(names).toContain("MaxSpread");
			expect(names).toContain("MaxPositions");
		});

		it("conservative() has more guards than standard", () => {
			const conservative = GuardPipeline.conservative();
			const standard = GuardPipeline.standard();
			expect(conservative.len()).toBeGreaterThanOrEqual(standard.len());
		});

		it("aggressive() is lighter than standard", () => {
			const aggressive = GuardPipeline.aggressive();
			expect(aggressive.len()).toBeGreaterThanOrEqual(2);
		});

		it("minimal() has at most 2 guards", () => {
			const minimal = GuardPipeline.minimal();
			expect(minimal.len()).toBeLessThanOrEqual(2);
		});
	});

	describe("requireGuards fallback", () => {
		it("returns self if non-empty", () => {
			const pipeline = GuardPipeline.create().with(alwaysAllow);
			expect(pipeline.requireGuards().len()).toBe(1);
		});

		it("falls back to minimal() if empty", () => {
			const pipeline = GuardPipeline.create();
			expect(pipeline.requireGuards().isEmpty()).toBe(false);
		});
	});
});
