import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Executor } from "../execution/types.js";
import { conditionId, marketTokenId } from "../shared/identifiers.js";
import { err, ok } from "../shared/result.js";
import {
	type BuildOverrides,
	BuiltStrategy,
	CID,
	Decimal,
	EventDispatcher,
	FILLED_RESULT,
	type GuardPipeline,
	type GuardVerdict,
	type Journal,
	MarketSide,
	OrderRegistry,
	PositionManager,
	type SignalDetector,
	SystemClock,
	TOKEN_ID,
	buildWithDispatcher,
	createMockContext,
	createMockDetector,
	createMockExecutor,
	createMockFeeModel,
	createMockJournal,
	createMockStateMachine,
	createMockWatchdog,
	openPosition,
} from "./built-strategy-test-helpers.js";

const FIXED_NOW = 1000000000000;

describe("BuiltStrategy — tick", () => {
	let eventDispatcher: EventDispatcher;
	let capturedEvents: Map<string, unknown[]>;

	beforeEach(() => {
		eventDispatcher = new EventDispatcher();
		capturedEvents = new Map();
		eventDispatcher.onSdk("*", (event) => {
			const list = capturedEvents.get(event.type) ?? [];
			list.push(event);
			capturedEvents.set(event.type, list);
		});
	});

	function build(overrides: BuildOverrides = {}): BuiltStrategy {
		return buildWithDispatcher(eventDispatcher, overrides);
	}

	function sdkEvents(type: string): unknown[] {
		return capturedEvents.get(type) ?? [];
	}

	it("should return early when tick is already in progress (re-entrancy guard)", async () => {
		let executorCallCount = 0;

		const slowExecutor: Executor = {
			submit: async () => {
				executorCallCount++;
				await new Promise((r) => setTimeout(r, 50));
				return FILLED_RESULT;
			},
			cancel: async () => ok(undefined),
		};

		const strategy = build({ executor: slowExecutor });
		const ctx = createMockContext();

		const tick1 = strategy.tick(ctx);
		await new Promise((r) => setTimeout(r, 5));
		const tick2 = strategy.tick(ctx);

		await Promise.all([tick1, tick2]);
		expect(executorCallCount).toBe(1);
	});

	it("should return early when cannot open and cannot close", async () => {
		const strategy = build({ canOpen: false, canClose: false });
		await strategy.tick(createMockContext());
		expect(sdkEvents("order_placed")).toHaveLength(0);
	});

	it("should process exits for open positions", async () => {
		const pm = openPosition(PositionManager.create());
		const strategy = build({
			positionManager: pm,
			exitReason: { type: "take_profit", roi: Decimal.from(0.2) },
			detector: createMockDetector(null),
		});

		await strategy.tick(createMockContext());
		expect(sdkEvents("position_closed")).toHaveLength(1);
	});

	it("should return early when cannot open but has no positions", async () => {
		const strategy = build({ canOpen: false, canClose: true });
		await strategy.tick(createMockContext());
		expect(sdkEvents("order_placed")).toHaveLength(0);
	});

	it("should emit guard_blocked event when guard blocks entry", async () => {
		const strategy = build({
			guardVerdict: {
				type: "block",
				guard: "max_spread",
				reason: "spread too wide",
				recoverable: true,
			},
		});

		await strategy.tick(createMockContext());

		const blocked = sdkEvents("guard_blocked");
		expect(blocked).toHaveLength(1);
		expect((blocked[0] as unknown as { guardName: string }).guardName).toBe("max_spread");
	});

	it("should return early when detector returns no signal", async () => {
		const strategy = build({ detector: createMockDetector(null) });
		await strategy.tick(createMockContext());
		expect(sdkEvents("order_placed")).toHaveLength(0);
	});

	it("should open position when guard allows and signal detected", async () => {
		const strategy = build({});
		await strategy.tick(createMockContext());
		expect(sdkEvents("order_placed")).toHaveLength(1);
		expect(sdkEvents("position_opened")).toHaveLength(1);
	});

	it("should emit events in correct order: exit check, guard check, entry", async () => {
		const eventOrder: string[] = [];
		const pm = openPosition(PositionManager.create());

		const mockExitPipeline = {
			evaluate: () => {
				eventOrder.push("exit_evaluate");
				return { type: "take_profit", roi: Decimal.from(0.2) };
			},
		};

		const mockGuardPipeline = {
			evaluate: () => {
				eventOrder.push("guard_evaluate");
				return { type: "allow" } as GuardVerdict;
			},
		};

		const mockDetector: SignalDetector<unknown, unknown> = {
			name: "mock-detector",
			detectEntry: () => {
				eventOrder.push("detect_entry");
				return { edge: 0.1 };
			},
			toOrder: () => {
				eventOrder.push("to_order");
				return {
					conditionId: CID,
					tokenId: TOKEN_ID,
					side: MarketSide.Yes,
					direction: "buy" as const,
					price: Decimal.from(0.55),
					size: Decimal.from(10),
				};
			},
		};

		const mockExecutor: Executor = {
			submit: async () => {
				eventOrder.push("executor_submit");
				return FILLED_RESULT;
			},
			cancel: async () => ok(undefined),
		};

		const strategy = new BuiltStrategy({
			position: { positionManager: pm },
			risk: {
				guardPipeline: mockGuardPipeline as unknown as GuardPipeline,
				exitPipeline: mockExitPipeline as unknown as ExitPipeline,
			},
			lifecycle: {
				stateMachine: createMockStateMachine(),
				watchdog: createMockWatchdog(),
			},
			monitor: { eventDispatcher, orderRegistry: OrderRegistry.create(SystemClock) },
			accounting: { feeModel: createMockFeeModel() },
			executor: mockExecutor,
			detector: mockDetector,
			journal: null,
		});

		await strategy.tick(createMockContext());

		expect(eventOrder).toEqual([
			"exit_evaluate",
			"executor_submit",
			"guard_evaluate",
			"detect_entry",
			"to_order",
			"executor_submit",
		]);
	});

	it("should emit error_occurred when entry executor fails", async () => {
		const strategy = build({
			executor: createMockExecutor(
				err({
					code: "INSUFFICIENT_LIQUIDITY",
					message: "not enough liquidity",
					category: "execution",
				}),
			),
		});

		await strategy.tick(createMockContext());

		expect(sdkEvents("order_placed")).toHaveLength(0);
		const errors = sdkEvents("error_occurred");
		expect(errors).toHaveLength(1);
		expect((errors[0] as { code: string }).code).toBe("entry_submit_failed");
	});

	it("should touch watchdog on each tick", async () => {
		const watchdog = createMockWatchdog();
		const strategy = build({ watchdog, detector: createMockDetector(null) });
		await strategy.tick(createMockContext());
		expect(watchdog.touch).toHaveBeenCalledOnce();
	});

	it("should still process exits when guard blocks entry", async () => {
		const pm = openPosition(PositionManager.create());
		const strategy = build({
			positionManager: pm,
			exitReason: { type: "stop_loss", loss: Decimal.from(0.1) },
			guardVerdict: {
				type: "block",
				guard: "max_spread",
				reason: "spread too wide",
				recoverable: true,
			},
		});

		await strategy.tick(createMockContext());
		expect(sdkEvents("guard_blocked")).toHaveLength(1);
		expect(sdkEvents("position_closed")).toHaveLength(1);
	});

	it("should compute fee on position close", async () => {
		const pm = openPosition(PositionManager.create());
		const strategy = build({
			positionManager: pm,
			exitReason: { type: "take_profit", roi: Decimal.from(0.2) },
			detector: createMockDetector(null),
		});

		await strategy.tick(createMockContext());

		const closed = sdkEvents("position_closed");
		expect(closed).toHaveLength(1);
		expect((closed[0] as { pnl: number }).pnl).toBeDefined();
	});

	it("should journal when journal is provided", async () => {
		const journal = createMockJournal();
		const strategy = build({ journal });
		await strategy.tick(createMockContext());
		expect(journal.record).toHaveBeenCalled();
	});

	it("should work without journal (optional)", async () => {
		const strategy = build({ journal: null });
		await expect(strategy.tick(createMockContext())).resolves.not.toThrow();
	});

	it("should handle executor errors gracefully and emit error event", async () => {
		const strategy = build({
			executor: createMockExecutor(
				err({
					code: "NETWORK_ERROR",
					message: "connection failed",
					category: "network",
				}),
			),
		});

		await expect(strategy.tick(createMockContext())).resolves.not.toThrow();
		expect(sdkEvents("error_occurred")).toHaveLength(1);
	});

	it("should not open position when state does not allow opening", async () => {
		const strategy = build({ canOpen: false, canClose: true });
		await strategy.tick(createMockContext());
		expect(sdkEvents("position_opened")).toHaveLength(0);
	});

	it("should handle positions with different sides correctly", async () => {
		const noTokenId = marketTokenId("NO-test-market");
		const pm = PositionManager.create();
		const opened = pm.open(
			CID,
			noTokenId,
			MarketSide.No,
			Decimal.from(0.5),
			Decimal.from(10),
			FIXED_NOW - 10000,
		);
		if (!opened.ok) throw new Error("Failed to open position");

		const strategy = build({
			positionManager: opened.value,
			exitReason: { type: "time_exit", remainingSecs: 0 },
			detector: createMockDetector(null),
		});

		await strategy.tick(createMockContext());
		expect(sdkEvents("position_closed")).toHaveLength(1);
	});

	it("should process both exits and entries in same tick", async () => {
		const pm = openPosition(PositionManager.create());
		const strategy = build({
			positionManager: pm,
			exitReason: { type: "take_profit", roi: Decimal.from(0.2) },
		});

		await strategy.tick(createMockContext());
		expect(sdkEvents("position_closed")).toHaveLength(1);
		// 2 order_placed: one for exit sell, one for entry buy
		expect(sdkEvents("order_placed")).toHaveLength(2);
	});

	it("should emit error_occurred when exit executor fails", async () => {
		const pm = openPosition(PositionManager.create());
		const strategy = build({
			positionManager: pm,
			exitReason: { type: "stop_loss", loss: Decimal.from(0.1) },
			executor: createMockExecutor(
				err({
					code: "NETWORK_ERROR",
					message: "connection timeout",
					category: "retryable",
				}),
			),
			detector: createMockDetector(null),
		});

		await strategy.tick(createMockContext());
		expect(sdkEvents("position_closed")).toHaveLength(0);
		const errors = sdkEvents("error_occurred");
		expect(errors).toHaveLength(1);
		expect((errors[0] as { code: string }).code).toBe("exit_submit_failed");
	});

	it("should survive journal write failure without crashing tick", async () => {
		const failingJournal: Journal = {
			record: vi.fn(async () => {
				throw new Error("disk full");
			}),
		};

		const strategy = build({ journal: failingJournal });
		await expect(strategy.tick(createMockContext())).resolves.not.toThrow();
		expect(sdkEvents("position_opened")).toHaveLength(1);
		const errors = sdkEvents("error_occurred");
		expect(errors.length).toBeGreaterThan(0);
		expect(errors.some((e) => (e as { code: string }).code === "JOURNAL_WRITE_FAILED")).toBe(true);
	});

	it("should reset tickInProgress after detector throws and recover on next tick", async () => {
		let callCount = 0;
		const flakyDetector: SignalDetector<unknown, unknown> = {
			name: "flaky",
			detectEntry: () => {
				callCount++;
				if (callCount === 1) {
					throw new Error("detector crash");
				}
				return { edge: 0.1, confidence: 0.8 };
			},
			toOrder: () => ({
				conditionId: CID,
				tokenId: TOKEN_ID,
				side: MarketSide.Yes,
				direction: "buy" as const,
				price: Decimal.from(0.55),
				size: Decimal.from(10),
			}),
		};

		const strategy = build({ detector: flakyDetector });

		// First tick: detector throws but tick catches it (BUG-8 fix)
		await expect(strategy.tick(createMockContext())).resolves.not.toThrow();

		const errors = sdkEvents("error_occurred") as Array<{ code: string }>;
		expect(errors.some((e) => e.code === "DETECTOR_THREW")).toBe(true);

		// Second tick on SAME instance: detector succeeds
		await strategy.tick(createMockContext());
		expect(sdkEvents("position_opened")).toHaveLength(1);
	});

	it("should include currentValue and threshold in guard_blocked when present", async () => {
		const strategy = build({
			guardVerdict: {
				type: "block",
				guard: "max_exposure",
				reason: "too much exposure",
				recoverable: false,
				currentValue: 5000,
				threshold: 3000,
			},
		});

		await strategy.tick(createMockContext());

		const blocked = sdkEvents("guard_blocked");
		expect(blocked).toHaveLength(1);
		const event = blocked[0] as Record<string, unknown>;
		expect(event.currentValue).toBe(5000);
		expect(event.threshold).toBe(3000);
	});

	it("should journal position_closed on exit path", async () => {
		const journal = createMockJournal();
		const pm = openPosition(PositionManager.create());

		const strategy = build({
			journal,
			positionManager: pm,
			exitReason: { type: "take_profit", roi: Decimal.from(0.2) },
			detector: createMockDetector(null),
		});

		await strategy.tick(createMockContext());

		const calls = (journal.record as ReturnType<typeof vi.fn>).mock.calls;
		const closedEntry = calls.find(([e]: [{ type: string }]) => e.type === "position_closed");
		expect(closedEntry).toBeDefined();
	});

	it("should use intent price when avgFillPrice is undefined", async () => {
		const noFillPriceResult = ok({
			clientOrderId: CID as unknown as import("../shared/identifiers.js").ClientOrderId,
			exchangeOrderId: CID as unknown as import("../shared/identifiers.js").ExchangeOrderId,
			finalState: "filled" as const,
			totalFilled: Decimal.from(10),
			avgFillPrice: undefined,
			tradeId: "trade-456",
			fee: Decimal.from(0),
		});

		const strategy = build({ executor: createMockExecutor(noFillPriceResult) });
		await strategy.tick(createMockContext());

		const opened = sdkEvents("position_opened");
		expect(opened).toHaveLength(1);
		expect((opened[0] as { entryPrice: number }).entryPrice).toBe(0.55);
	});

	it("should process multiple positions during exit", async () => {
		const CID2 = conditionId("second-condition");
		const TOKEN2 = marketTokenId("YES-second-market");

		let pm = openPosition(PositionManager.create());
		const opened = pm.open(
			CID2,
			TOKEN2,
			MarketSide.Yes,
			Decimal.from(0.6),
			Decimal.from(5),
			FIXED_NOW - 5000,
		);
		if (!opened.ok) throw new Error("Failed to open position");
		pm = opened.value;

		const strategy = build({
			positionManager: pm,
			exitReason: { type: "take_profit", roi: Decimal.from(0.2) },
			detector: createMockDetector(null),
		});

		await strategy.tick(createMockContext());
		expect(sdkEvents("position_closed")).toHaveLength(2);
	});

	it("should use ctx.spot() as sell price instead of entry price", async () => {
		const pm = openPosition(PositionManager.create());
		const executor = createMockExecutor();

		const strategy = build({
			positionManager: pm,
			exitReason: { type: "take_profit", roi: Decimal.from(0.2) },
			executor,
			detector: createMockDetector(null),
		});

		await strategy.tick(createMockContext());

		const submitCalls = (executor.submit as ReturnType<typeof vi.fn>).mock.calls;
		expect(submitCalls).toHaveLength(1);
		const intent = submitCalls[0]?.[0] as { price: { toNumber: () => number } };
		expect(intent.price.toNumber()).toBe(0.55);
	});

	it("should fallback to entry price when ctx.spot() is null and emit warning", async () => {
		const pm = openPosition(PositionManager.create());
		const executor = createMockExecutor();

		const strategy = build({
			positionManager: pm,
			exitReason: { type: "take_profit", roi: Decimal.from(0.2) },
			executor,
			detector: createMockDetector(null),
		});

		const ctx = createMockContext({ spot: () => null });
		await strategy.tick(ctx);

		const submitCalls = (executor.submit as ReturnType<typeof vi.fn>).mock.calls;
		expect(submitCalls).toHaveLength(1);
		const intent = submitCalls[0]?.[0] as { price: { toNumber: () => number } };
		expect(intent.price.toNumber()).toBe(0.5);

		const errors = sdkEvents("error_occurred") as Array<{ code: string }>;
		expect(errors.some((e) => e.code === "SPOT_PRICE_UNAVAILABLE")).toBe(true);
	});

	describe("Error paths in tick()", () => {
		it("should emit GUARD_THREW when guard pipeline throws", async () => {
			const throwingGuardPipeline = {
				evaluate: () => {
					throw new Error("guard internal error");
				},
				isEmpty: () => false,
				len: () => 1,
				guardNames: () => ["throwing-guard"],
				requireGuards: () => ({}) as GuardPipeline,
				with: () => ({}) as GuardPipeline,
			} as unknown as GuardPipeline;

			const strategy = build({
				guardPipeline: throwingGuardPipeline,
				detector: createMockDetector(null),
			});

			await strategy.tick(createMockContext());

			const errors = sdkEvents("error_occurred") as Array<{ code: string; message: string }>;
			expect(errors.some((e) => e.code === "GUARD_THREW")).toBe(true);
			expect(errors.find((e) => e.code === "GUARD_THREW")?.message).toContain(
				"guard internal error",
			);
			expect(sdkEvents("position_opened")).toHaveLength(0);
		});

		it("should emit EXIT_PIPELINE_THREW when exit pipeline throws", async () => {
			const pm = openPosition(PositionManager.create());
			const throwingExitPipeline = {
				evaluate: () => {
					throw new Error("exit pipeline crash");
				},
				isEmpty: () => false,
				len: () => 1,
				policyNames: () => ["throwing-exit"],
				requireExits: () => ({}) as ExitPipeline,
				with: () => ({}) as ExitPipeline,
			} as unknown as ExitPipeline;

			const strategy = build({
				positionManager: pm,
				exitPipeline: throwingExitPipeline,
				detector: createMockDetector(null),
			});

			await strategy.tick(createMockContext());

			const errors = sdkEvents("error_occurred") as Array<{ code: string; message: string }>;
			expect(errors.some((e) => e.code === "EXIT_PIPELINE_THREW")).toBe(true);
			expect(errors.find((e) => e.code === "EXIT_PIPELINE_THREW")?.message).toContain(
				"exit pipeline crash",
			);
			expect(sdkEvents("position_closed")).toHaveLength(0);
		});

		it("should emit INVALID_INTENT when detector returns zero size", async () => {
			const zeroSizeDetector: SignalDetector<unknown, unknown> = {
				name: "zero-size-detector",
				detectEntry: () => ({ edge: 0.1 }),
				toOrder: () => ({
					conditionId: CID,
					tokenId: TOKEN_ID,
					side: MarketSide.Yes,
					direction: "buy" as const,
					price: Decimal.from(0.55),
					size: Decimal.zero(),
				}),
			};

			const strategy = build({ detector: zeroSizeDetector });
			await strategy.tick(createMockContext());

			const errors = sdkEvents("error_occurred") as Array<{ code: string; message: string }>;
			expect(errors.some((e) => e.code === "INVALID_INTENT")).toBe(true);
			expect(errors.find((e) => e.code === "INVALID_INTENT")?.message).toContain("invalid size");
			expect(sdkEvents("position_opened")).toHaveLength(0);
		});

		it("should emit INVALID_INTENT when detector returns negative size", async () => {
			const negSizeDetector: SignalDetector<unknown, unknown> = {
				name: "neg-size-detector",
				detectEntry: () => ({ edge: 0.1 }),
				toOrder: () => ({
					conditionId: CID,
					tokenId: TOKEN_ID,
					side: MarketSide.Yes,
					direction: "buy" as const,
					price: Decimal.from(0.55),
					size: Decimal.from(-5),
				}),
			};

			const strategy = build({ detector: negSizeDetector });
			await strategy.tick(createMockContext());

			const errors = sdkEvents("error_occurred") as Array<{ code: string; message: string }>;
			expect(errors.some((e) => e.code === "INVALID_INTENT")).toBe(true);
			expect(sdkEvents("position_opened")).toHaveLength(0);
		});

		it("should emit INVALID_INTENT when detector returns zero price", async () => {
			const zeroPriceDetector: SignalDetector<unknown, unknown> = {
				name: "zero-price-detector",
				detectEntry: () => ({ edge: 0.1 }),
				toOrder: () => ({
					conditionId: CID,
					tokenId: TOKEN_ID,
					side: MarketSide.Yes,
					direction: "buy" as const,
					price: Decimal.zero(),
					size: Decimal.from(10),
				}),
			};

			const strategy = build({ detector: zeroPriceDetector });
			await strategy.tick(createMockContext());

			const errors = sdkEvents("error_occurred") as Array<{ code: string; message: string }>;
			expect(errors.some((e) => e.code === "INVALID_INTENT")).toBe(true);
			expect(errors.find((e) => e.code === "INVALID_INTENT")?.message).toContain("invalid price");
			expect(sdkEvents("position_opened")).toHaveLength(0);
		});

		it("should emit INVALID_INTENT when detector returns negative price", async () => {
			const negPriceDetector: SignalDetector<unknown, unknown> = {
				name: "neg-price-detector",
				detectEntry: () => ({ edge: 0.1 }),
				toOrder: () => ({
					conditionId: CID,
					tokenId: TOKEN_ID,
					side: MarketSide.Yes,
					direction: "buy" as const,
					price: Decimal.from(-0.5),
					size: Decimal.from(10),
				}),
			};

			const strategy = build({ detector: negPriceDetector });
			await strategy.tick(createMockContext());

			const errors = sdkEvents("error_occurred") as Array<{ code: string; message: string }>;
			expect(errors.some((e) => e.code === "INVALID_INTENT")).toBe(true);
			expect(sdkEvents("position_opened")).toHaveLength(0);
		});

		it("should emit POSITION_OPEN_FAILED when positionManager.open() returns error", async () => {
			const executor = createMockExecutor();

			const pmWithIssue = PositionManager.create();
			const opened = pmWithIssue.open(
				CID,
				TOKEN_ID,
				MarketSide.Yes,
				Decimal.from(0.5),
				Decimal.from(10),
				FIXED_NOW,
			);
			if (!opened.ok) throw new Error("Failed to open");

			const strategy = build({
				positionManager: opened.value,
				executor,
			});

			await strategy.tick(createMockContext());

			const errors = sdkEvents("error_occurred") as Array<{ code: string }>;
			expect(errors.some((e) => e.code === "POSITION_OPEN_FAILED")).toBe(true);
		});

		it("should block entries when watchdog reports stale data", async () => {
			const staleWatchdog = {
				touch: vi.fn(),
				check: vi.fn(() => ({ status: "ok", stale: true })),
				status: vi.fn(() => ({ status: "ok", stale: true, lastTouchMs: FIXED_NOW })),
				shouldBlockEntries: vi.fn(() => true),
			} as unknown as ReturnType<typeof createMockWatchdog>;

			const strategy = build({
				watchdog: staleWatchdog,
				detector: createMockDetector({ edge: 0.1 }),
			});

			await strategy.tick(createMockContext());

			const errors = sdkEvents("error_occurred") as Array<{ code: string }>;
			expect(errors.some((e) => e.code === "WATCHDOG_ALERT")).toBe(true);
			expect(sdkEvents("position_opened")).toHaveLength(0);
		});

		it("should survive all error paths and allow subsequent ticks to succeed", async () => {
			let tickCount = 0;
			const flakyDetector: SignalDetector<unknown, unknown> = {
				name: "flaky",
				detectEntry: () => {
					tickCount++;
					if (tickCount === 1) {
						throw new Error("first tick detector crash");
					}
					return { edge: 0.1 };
				},
				toOrder: () => ({
					conditionId: CID,
					tokenId: TOKEN_ID,
					side: MarketSide.Yes,
					direction: "buy" as const,
					price: Decimal.from(0.55),
					size: Decimal.from(10),
				}),
			};

			const strategy = build({ detector: flakyDetector });

			await strategy.tick(createMockContext());
			expect(sdkEvents("error_occurred").length).toBeGreaterThan(0);

			await strategy.tick(createMockContext());
			expect(sdkEvents("position_opened")).toHaveLength(1);
		});
	});
});
