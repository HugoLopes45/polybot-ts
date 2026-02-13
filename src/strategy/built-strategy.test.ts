import { beforeEach, describe, expect, it, vi } from "vitest";
import { fixedNotionalFee } from "../accounting/fee-model.js";
import type { Executor } from "../execution/types.js";
import { ConnectivityWatchdog } from "../lifecycle/watchdog.js";
import { conditionId, marketTokenId } from "../shared/identifiers.js";
import { err, ok } from "../shared/result.js";
import { FakeClock } from "../shared/time.js";
import {
	type BuildOverrides,
	BuiltStrategy,
	CID,
	Decimal,
	EventDispatcher,
	type ExitPipeline,
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
	createMockExitPipeline,
	createMockFeeModel,
	createMockGuardPipeline,
	createMockJournal,
	createMockStateMachine,
	createMockWatchdog,
	openPosition,
} from "./built-strategy-test-helpers.js";

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
			Date.now() - 10000,
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
			Date.now() - 5000,
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

	it("should await safeJournal in emitExecutionError", async () => {
		const journalCalls: string[] = [];
		const slowJournal: Journal = {
			record: vi.fn(async (entry: { type: string }) => {
				journalCalls.push(entry.type);
			}),
		};

		const strategy = build({
			journal: slowJournal,
			executor: createMockExecutor(
				err({
					code: "NETWORK_ERROR",
					message: "connection failed",
					category: "retryable",
				}),
			),
		});

		await strategy.tick(createMockContext());
		expect(journalCalls).toContain("error");
	});

	it("should include error detail in JOURNAL_WRITE_FAILED event", async () => {
		const failingJournal: Journal = {
			record: vi.fn(async () => {
				throw new Error("ENOSPC: no space left on device");
			}),
		};

		const strategy = build({ journal: failingJournal });
		await strategy.tick(createMockContext());

		const errors = sdkEvents("error_occurred") as Array<{ code: string; message: string }>;
		const journalError = errors.find((e) => e.code === "JOURNAL_WRITE_FAILED");
		expect(journalError).toBeDefined();
		expect(journalError?.message).toContain("ENOSPC: no space left on device");
	});

	it("should include fee in position_closed event and journal", async () => {
		const journal = createMockJournal();
		const pm = openPosition(PositionManager.create());

		const strategy = build({
			journal,
			positionManager: pm,
			exitReason: { type: "take_profit", roi: Decimal.from(0.2) },
			feeModel: fixedNotionalFee(10),
			detector: createMockDetector(null),
		});

		await strategy.tick(createMockContext());

		const closed = sdkEvents("position_closed") as Array<{ fee?: number }>;
		expect(closed).toHaveLength(1);
		expect(closed[0]?.fee).toBeDefined();
		expect(typeof closed[0]?.fee).toBe("number");

		const calls = (journal.record as ReturnType<typeof vi.fn>).mock.calls;
		const closedEntry = calls.find(([e]: [{ type: string }]) => e.type === "position_closed");
		expect(closedEntry).toBeDefined();
		expect((closedEntry?.[0] as { fee?: number }).fee).toBeDefined();
	});

	it("should catch detector throw and emit DETECTOR_THREW error (BUG-8)", async () => {
		const badDetector: SignalDetector<unknown, unknown> = {
			name: "throws",
			detectEntry: () => {
				throw new Error("detector crash");
			},
			toOrder: () => {
				throw new Error("unreachable");
			},
		};

		const strategy = build({ detector: badDetector });
		await expect(strategy.tick(createMockContext())).resolves.not.toThrow();

		const errors = sdkEvents("error_occurred") as Array<{ code: string; message: string }>;
		expect(errors.some((e) => e.code === "DETECTOR_THREW")).toBe(true);
		const detectorErr = errors.find((e) => e.code === "DETECTOR_THREW");
		expect(detectorErr?.message).toContain("detector crash");
	});

	it("should catch toOrder throw and emit DETECTOR_THREW error (BUG-8)", async () => {
		const badDetector: SignalDetector<unknown, unknown> = {
			name: "throws-on-toOrder",
			detectEntry: () => ({ edge: 0.1 }),
			toOrder: () => {
				throw new Error("toOrder exploded");
			},
		};

		const strategy = build({ detector: badDetector });
		await expect(strategy.tick(createMockContext())).resolves.not.toThrow();

		const errors = sdkEvents("error_occurred") as Array<{ code: string; message: string }>;
		expect(errors.some((e) => e.code === "DETECTOR_THREW")).toBe(true);
		expect(errors.find((e) => e.code === "DETECTOR_THREW")?.message).toContain("toOrder exploded");
	});

	it("should catch exit pipeline throw and continue with remaining positions (BUG-9)", async () => {
		const CID2 = conditionId("second-condition");
		const TOKEN2 = marketTokenId("YES-second-market");

		let pm = openPosition(PositionManager.create());
		const opened = pm.open(
			CID2,
			TOKEN2,
			MarketSide.Yes,
			Decimal.from(0.6),
			Decimal.from(5),
			Date.now() - 5000,
		);
		if (!opened.ok) throw new Error("Failed to open position");
		pm = opened.value;

		let evalCount = 0;
		const throwingExitPipeline = {
			evaluate: () => {
				evalCount++;
				if (evalCount === 1) {
					throw new Error("exit policy crash");
				}
				return { type: "take_profit", roi: Decimal.from(0.2) } as const;
			},
		} as unknown as ExitPipeline;

		const strategy = new BuiltStrategy({
			position: { positionManager: pm },
			risk: {
				guardPipeline: createMockGuardPipeline({ type: "allow" }),
				exitPipeline: throwingExitPipeline,
			},
			lifecycle: {
				stateMachine: createMockStateMachine(),
				watchdog: createMockWatchdog(),
			},
			monitor: { eventDispatcher, orderRegistry: OrderRegistry.create(SystemClock) },
			accounting: { feeModel: createMockFeeModel() },
			executor: createMockExecutor(),
			detector: createMockDetector(null),
			journal: null,
		});

		await expect(strategy.tick(createMockContext())).resolves.not.toThrow();

		const errors = sdkEvents("error_occurred") as Array<{ code: string }>;
		expect(errors.some((e) => e.code === "EXIT_PIPELINE_THREW")).toBe(true);
		expect(sdkEvents("position_closed")).toHaveLength(1);
	});

	it("should catch guard pipeline throw and block entry (BUG-10)", async () => {
		const throwingGuardPipeline = {
			evaluate: () => {
				throw new Error("guard exploded");
			},
		} as unknown as GuardPipeline;

		const strategy = new BuiltStrategy({
			position: { positionManager: PositionManager.create() },
			risk: {
				guardPipeline: throwingGuardPipeline,
				exitPipeline: createMockExitPipeline(null),
			},
			lifecycle: {
				stateMachine: createMockStateMachine(),
				watchdog: createMockWatchdog(),
			},
			monitor: { eventDispatcher, orderRegistry: OrderRegistry.create(SystemClock) },
			accounting: { feeModel: createMockFeeModel() },
			executor: createMockExecutor(),
			detector: createMockDetector({ edge: 0.1 }),
			journal: null,
		});

		await expect(strategy.tick(createMockContext())).resolves.not.toThrow();

		const errors = sdkEvents("error_occurred") as Array<{ code: string; category: string }>;
		const guardErr = errors.find((e) => e.code === "GUARD_THREW");
		expect(guardErr).toBeDefined();
		expect(guardErr?.category).toBe("fatal");
		expect(sdkEvents("position_opened")).toHaveLength(0);
	});

	it("should block entries when watchdog reports stale data (HARD-15)", async () => {
		const clock = new FakeClock(1000);
		const watchdog = new ConnectivityWatchdog({ warningMs: 100, criticalMs: 200 }, clock);

		clock.advance(250);

		const strategy = build({ watchdog, clock });
		await strategy.tick(createMockContext());

		const errors = sdkEvents("error_occurred") as Array<{ code: string }>;
		expect(errors.some((e) => e.code === "WATCHDOG_ALERT")).toBe(true);
		expect(sdkEvents("position_opened")).toHaveLength(0);
	});

	it("should still process exits when watchdog is stale (HARD-15)", async () => {
		const clock = new FakeClock(1000);
		const watchdog = new ConnectivityWatchdog({ warningMs: 100, criticalMs: 200 }, clock);
		const pm = openPosition(PositionManager.create());

		clock.advance(250);

		const strategy = build({
			watchdog,
			clock,
			positionManager: pm,
			exitReason: { type: "take_profit", roi: Decimal.from(0.2) },
			detector: createMockDetector(null),
		});

		await strategy.tick(createMockContext());
		expect(sdkEvents("position_closed")).toHaveLength(1);
	});

	it("should reject zero-size intent from detector (HARD-16)", async () => {
		const badDetector: SignalDetector<unknown, unknown> = {
			name: "zero-size",
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

		const executor = createMockExecutor();
		const strategy = build({ detector: badDetector, executor });
		await strategy.tick(createMockContext());

		const errors = sdkEvents("error_occurred") as Array<{ code: string }>;
		expect(errors.some((e) => e.code === "INVALID_INTENT")).toBe(true);
		expect(sdkEvents("position_opened")).toHaveLength(0);
		expect(executor.submit).not.toHaveBeenCalled();
	});

	it("should reject negative-price intent from detector (HARD-16)", async () => {
		const badDetector: SignalDetector<unknown, unknown> = {
			name: "neg-price",
			detectEntry: () => ({ edge: 0.1 }),
			toOrder: () => ({
				conditionId: CID,
				tokenId: TOKEN_ID,
				side: MarketSide.Yes,
				direction: "buy" as const,
				price: Decimal.from(-0.55),
				size: Decimal.from(10),
			}),
		};

		const executor = createMockExecutor();
		const strategy = build({ detector: badDetector, executor });
		await strategy.tick(createMockContext());

		const errors = sdkEvents("error_occurred") as Array<{ code: string }>;
		expect(errors.some((e) => e.code === "INVALID_INTENT")).toBe(true);
		expect(executor.submit).not.toHaveBeenCalled();
	});

	it("should emit order_placed before position_opened on entry (HARD-17)", async () => {
		const eventOrder: string[] = [];
		eventDispatcher.onSdk("*", (event) => {
			if (event.type === "order_placed" || event.type === "position_opened") {
				eventOrder.push(event.type);
			}
		});

		const strategy = build({});
		await strategy.tick(createMockContext());

		const orderIdx = eventOrder.indexOf("order_placed");
		const posIdx = eventOrder.indexOf("position_opened");
		expect(orderIdx).toBeLessThan(posIdx);
	});

	it("should emit order_placed for exit sell orders (HARD-18)", async () => {
		const pm = openPosition(PositionManager.create());
		const strategy = build({
			positionManager: pm,
			exitReason: { type: "take_profit", roi: Decimal.from(0.2) },
			detector: createMockDetector(null),
		});

		await strategy.tick(createMockContext());

		const orderEvents = sdkEvents("order_placed") as Array<{
			side: string;
			conditionId: string;
		}>;
		expect(orderEvents).toHaveLength(1);
		expect(orderEvents[0]?.side).toBe("no");
	});

	it("should journal exit_signal before executing exit (HARD-19)", async () => {
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
		const exitSignalEntry = calls.find(([e]: [{ type: string }]) => e.type === "exit_signal");
		expect(exitSignalEntry).toBeDefined();
		expect((exitSignalEntry?.[0] as { reason: { type: string } }).reason.type).toBe("take_profit");
	});
});
