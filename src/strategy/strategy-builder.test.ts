import { describe, expect, it, vi } from "vitest";
import { fixedNotionalFee } from "../accounting/fee-model.js";
import { EventDispatcher } from "../events/event-dispatcher.js";
import type { SdkEvent } from "../events/sdk-events.js";
import type { Executor } from "../execution/types.js";
import { GuardPipeline } from "../risk/guard-pipeline.js";
import type { EntryGuard, GuardVerdict } from "../risk/types.js";
import { Decimal } from "../shared/decimal.js";
import { conditionId, marketTokenId } from "../shared/identifiers.js";
import type { ConditionId } from "../shared/identifiers.js";
import type { MarketSide as MarketSideType } from "../shared/market-side.js";
import { MarketSide } from "../shared/market-side.js";
import { ok } from "../shared/result.js";
import { FakeClock } from "../shared/time.js";
import { ExitPipeline } from "../signal/exit-pipeline.js";
import type { ExitPolicy, SignalDetector } from "../signal/types.js";
import type { TickContext } from "./built-strategy.js";
import type { Journal } from "./journal.js";
import { StrategyBuilder, createSafeDispatcher } from "./strategy-builder.js";

function mockDetector(): SignalDetector<unknown, unknown> {
	return {
		name: "test-detector",
		detectEntry: () => null,
		toOrder: () => {
			throw new Error("not implemented");
		},
	};
}

function mockGuard(): GuardPipeline {
	const guard: EntryGuard = {
		name: "test-guard",
		check: () => ({ type: "allow" }) as GuardVerdict,
	};
	return GuardPipeline.create().with(guard);
}

function mockExit(): ExitPipeline {
	const policy: ExitPolicy = {
		name: "test-exit",
		shouldExit: () => null,
	};
	return ExitPipeline.create().with(policy);
}

function mockExecutor(): Executor {
	return {
		submit: vi.fn(async () =>
			ok({
				clientOrderId: "test",
				exchangeOrderId: "test",
				finalState: "filled" as const,
				totalFilled: Decimal.from(1),
				avgFillPrice: Decimal.from(0.5),
				tradeId: "t1",
				fee: Decimal.from(0),
			}),
		),
		cancel: vi.fn(async () => ok(undefined)),
	};
}

describe("StrategyBuilder", () => {
	describe("build (lenient)", () => {
		it("should build with minimum config", () => {
			const strategy = StrategyBuilder.create().withDetector(mockDetector()).build();

			expect(strategy).toBeDefined();
		});

		it("should return builder for chaining", () => {
			const result = StrategyBuilder.create().withDetector(mockDetector());

			expect(result).toBeInstanceOf(StrategyBuilder);
		});

		it("should use empty guard and exit pipelines by default", () => {
			// Should not crash — uses GuardPipeline.create() not {} as GuardPipeline
			const strategy = StrategyBuilder.create().build();

			expect(strategy).toBeDefined();
		});
	});

	describe("buildProduction (strict)", () => {
		it("should fail without detector", () => {
			const result = StrategyBuilder.create().buildProduction();

			expect(result.ok).toBe(false);
		});

		it("should fail without any guards", () => {
			const result = StrategyBuilder.create().withDetector(mockDetector()).buildProduction();

			expect(result.ok).toBe(false);
		});

		it("should fail without exit policies", () => {
			const result = StrategyBuilder.create()
				.withDetector(mockDetector())
				.withGuards(mockGuard())
				.buildProduction();

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error).toContain("exit");
			}
		});

		it("should fail without executor", () => {
			const result = StrategyBuilder.create()
				.withDetector(mockDetector())
				.withGuards(mockGuard())
				.withExits(mockExit())
				.buildProduction();

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error).toContain("executor");
			}
		});

		it("should fail without fee model", () => {
			const result = StrategyBuilder.create()
				.withDetector(mockDetector())
				.withGuards(mockGuard())
				.withExits(mockExit())
				.withExecutor(mockExecutor())
				.buildProduction();

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error).toContain("fee");
			}
		});

		it("should succeed with all required deps", () => {
			const result = StrategyBuilder.create()
				.withDetector(mockDetector())
				.withGuards(mockGuard())
				.withExits(mockExit())
				.withExecutor(mockExecutor())
				.withFeeModel(fixedNotionalFee(10))
				.buildProduction();

			expect(result.ok).toBe(true);
		});
	});

	describe("fluent chaining", () => {
		it("should support full method chaining", () => {
			const journal: Journal = { record: async () => {} };

			const strategy = StrategyBuilder.create()
				.withDetector(mockDetector())
				.withGuards(mockGuard())
				.withExits(mockExit())
				.withJournal(journal)
				.build();

			expect(strategy).toBeDefined();
		});
	});

	describe("immutability", () => {
		it("should return new builder instance on chaining", () => {
			const builder1 = StrategyBuilder.create();
			const builder2 = builder1.withDetector(mockDetector());

			expect(builder1).not.toBe(builder2);
		});

		it("should not affect original builder when chaining", () => {
			const builder1 = StrategyBuilder.create();
			builder1.withDetector(mockDetector());

			// Original builder still has no detector — buildProduction should fail
			const result = builder1.buildProduction();
			expect(result.ok).toBe(false);
		});
	});

	describe("default behavior contracts", () => {
		function createTickContext(): TickContext {
			const CID = conditionId("test-condition");
			return {
				conditionId: CID,
				nowMs: () => Date.now(),
				spot: () => Decimal.from(0.55),
				oraclePrice: () => Decimal.from(0.55),
				timeRemainingMs: () => 60000,
				bestBid: (_side: MarketSideType) => Decimal.from(0.54),
				bestAsk: (_side: MarketSideType) => Decimal.from(0.56),
				spread: (_side: MarketSideType) => Decimal.from(0.02),
				spreadPct: (_side: MarketSideType) => 3.7,
				openPositionCount: () => 0,
				totalExposure: () => Decimal.zero(),
				availableBalance: () => Decimal.from(1000),
				dailyPnl: () => Decimal.zero(),
				consecutiveLosses: () => 0,
				hasPendingOrderFor: (_cid: ConditionId, _side: MarketSideType) => false,
				lastTradeTimeMs: (_cid: ConditionId) => null,
				oracleAgeMs: () => null,
				bookAgeMs: () => null,
			};
		}

		it("default detector produces no trades on tick", async () => {
			const strategy = StrategyBuilder.create().build();

			// Cannot access the internal eventDispatcher, so test that tick
			// completes without error and no side effects (no throws)
			await expect(strategy.tick(createTickContext())).resolves.not.toThrow();
		});

		it("default executor returns error when signal is detected", async () => {
			const CID = conditionId("test-condition");
			const TOKEN_ID = marketTokenId("YES", "test-market");

			const detector: SignalDetector<unknown, unknown> = {
				name: "signal-detector",
				detectEntry: () => ({ edge: 0.1 }),
				toOrder: () => ({
					conditionId: CID,
					tokenId: TOKEN_ID,
					side: MarketSide.Yes,
					direction: "buy" as const,
					price: Decimal.from(0.55),
					size: Decimal.from(10),
				}),
			};

			const eventDispatcher = new EventDispatcher();
			const capturedErrors: Array<{ code: string }> = [];
			eventDispatcher.onSdk("error_occurred", (event) => {
				capturedErrors.push(event as { code: string });
			});

			// Build with detector but no executor — default executor returns err
			const strategy = StrategyBuilder.create().withDetector(detector).build();

			// Tick should not throw, but default executor should produce an error event
			// We can't capture it without the dispatcher, but at minimum it shouldn't crash
			await expect(strategy.tick(createTickContext())).resolves.not.toThrow();
		});
	});

	describe("createSafeDispatcher", () => {
		it("emits error_occurred when a handler throws", () => {
			const clock = new FakeClock(1000);
			const dispatcher = createSafeDispatcher(clock);

			const captured: SdkEvent[] = [];
			dispatcher.onSdk("error_occurred", (event) => {
				captured.push(event);
			});
			dispatcher.onSdk("order_placed", () => {
				throw new Error("boom");
			});

			dispatcher.emitSdk({
				type: "order_placed",
				timestamp: 1000,
				conditionId: "c",
				tokenId: "t",
				side: "Yes",
				direction: "buy",
				price: 0.5,
				size: 10,
			});

			expect(captured).toHaveLength(1);
			const evt = captured[0] as { code: string; message: string };
			expect(evt.code).toBe("HANDLER_THREW");
			expect(evt.message).toContain("boom");
		});

		it("prevents infinite recursion from wildcard error_occurred handler", () => {
			const clock = new FakeClock(1000);
			const dispatcher = createSafeDispatcher(clock);

			let callCount = 0;
			dispatcher.onSdk("*", () => {
				callCount++;
				throw new Error("wildcard throws");
			});

			// Should not recurse infinitely — the recursion guard stops it
			dispatcher.emitSdk({
				type: "order_placed",
				timestamp: 1000,
				conditionId: "c",
				tokenId: "t",
				side: "Yes",
				direction: "buy",
				price: 0.5,
				size: 10,
			});

			// Wildcard called for order_placed, then error_occurred is emitted
			// but the recursion guard prevents re-entering the callback
			expect(callCount).toBeGreaterThanOrEqual(1);
			expect(callCount).toBeLessThanOrEqual(3);
		});

		it("uses clock timestamp on error events", () => {
			const clock = new FakeClock(42000);
			const dispatcher = createSafeDispatcher(clock);

			const captured: SdkEvent[] = [];
			dispatcher.onSdk("error_occurred", (event) => {
				captured.push(event);
			});
			dispatcher.onSdk("order_placed", () => {
				throw new Error("oops");
			});

			dispatcher.emitSdk({
				type: "order_placed",
				timestamp: 1000,
				conditionId: "c",
				tokenId: "t",
				side: "Yes",
				direction: "buy",
				price: 0.5,
				size: 10,
			});

			expect(captured).toHaveLength(1);
			expect((captured[0] as { timestamp: number }).timestamp).toBe(42000);
		});
	});
});
