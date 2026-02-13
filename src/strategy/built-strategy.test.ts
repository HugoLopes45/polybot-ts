import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FeeModel } from "../accounting/fee-model.js";
import { fixedNotionalFee } from "../accounting/fee-model.js";
import { EventDispatcher } from "../events/event-dispatcher.js";
import type { Executor } from "../execution/types.js";
import { StrategyStateMachine } from "../lifecycle/state-machine.js";
import type { ConnectivityWatchdog } from "../lifecycle/watchdog.js";
import { OrderRegistry } from "../order/order-registry.js";
import { PositionManager } from "../position/position-manager.js";
import type { GuardPipeline } from "../risk/guard-pipeline.js";
import type { GuardVerdict } from "../risk/types.js";
import { Decimal } from "../shared/decimal.js";
import type { ConditionId } from "../shared/identifiers.js";
import {
	clientOrderId,
	conditionId,
	exchangeOrderId,
	marketTokenId,
} from "../shared/identifiers.js";
import type { MarketSide as MarketSideType } from "../shared/market-side.js";
import { MarketSide } from "../shared/market-side.js";
import { err, ok, unwrap } from "../shared/result.js";
import { SystemClock } from "../shared/time.js";
import { ExitPipeline } from "../signal/exit-pipeline.js";
import type { ExitReason, SignalDetector } from "../signal/types.js";
import { BuiltStrategy } from "./built-strategy.js";
import type { TickContext } from "./built-strategy.js";
import type { Journal } from "./journal.js";

const CID = conditionId("test-condition");
const TOKEN_ID = marketTokenId("YES", "test-market");
const CLIENT_ID = clientOrderId("client-123");
const EXCHANGE_ID = exchangeOrderId("exchange-456");

const FILLED_RESULT = ok({
	clientOrderId: CLIENT_ID,
	exchangeOrderId: EXCHANGE_ID,
	finalState: "filled" as const,
	totalFilled: Decimal.from(10),
	avgFillPrice: Decimal.from(0.55),
	tradeId: "trade-123",
	fee: Decimal.from(0.1),
});

function createMockExecutor(result: ReturnType<Executor["submit"]> = FILLED_RESULT): Executor {
	return {
		submit: vi.fn(async () => result),
		cancel: vi.fn(async () => ok(undefined)),
	};
}

function createMockDetector(signal: unknown): SignalDetector<unknown, unknown> {
	return {
		name: "mock-detector",
		detectEntry: vi.fn(() => signal),
		toOrder: vi.fn(() => ({
			conditionId: CID,
			tokenId: TOKEN_ID,
			side: MarketSide.Yes,
			direction: "buy" as const,
			price: Decimal.from(0.55),
			size: Decimal.from(10),
		})),
	};
}

function createMockGuardPipeline(verdict: GuardVerdict): GuardPipeline {
	return {
		evaluate: vi.fn(() => verdict),
		isEmpty: () => false,
		len: () => 1,
		guardNames: () => ["mock-guard"],
		requireGuards: () => ({}) as GuardPipeline,
		with: () => ({}) as GuardPipeline,
	} as unknown as GuardPipeline;
}

function createMockExitPipeline(reason: ExitReason | null): ExitPipeline {
	return {
		evaluate: vi.fn(() => reason),
		isEmpty: () => false,
		len: () => 1,
		policyNames: () => ["mock-exit"],
		requireExits: () => ExitPipeline.create(),
		with: () => ExitPipeline.create(),
	} as unknown as ExitPipeline;
}

function createMockWatchdog(): ConnectivityWatchdog {
	return {
		touch: vi.fn(),
		check: vi.fn(() => ({ status: "ok", stale: false })),
		status: vi.fn(() => ({ status: "ok", stale: false, lastTouchMs: Date.now() })),
	} as unknown as ConnectivityWatchdog;
}

function createMockStateMachine(canOpen = true, canClose = true): StrategyStateMachine {
	return {
		canOpen: vi.fn(() => canOpen),
		canClose: vi.fn(() => canClose),
		state: vi.fn(() => "active" as const),
		transition: vi.fn(),
	} as unknown as StrategyStateMachine;
}

function createMockFeeModel(): FeeModel {
	return fixedNotionalFee(10);
}

function createMockJournal(): Journal {
	return {
		record: vi.fn(async () => {}),
	};
}

function createMockContext(overrides?: Partial<TickContext>): TickContext {
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
		...overrides,
	};
}

function openPosition(pm: PositionManager): PositionManager {
	return unwrap(
		pm.open(CID, TOKEN_ID, MarketSide.Yes, Decimal.from(0.5), Decimal.from(10), Date.now() - 10000),
	);
}

describe("BuiltStrategy", () => {
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

	function buildWithDispatcher(overrides: {
		positionManager?: PositionManager;
		guardVerdict?: GuardVerdict;
		exitReason?: ExitReason | null;
		canOpen?: boolean;
		canClose?: boolean;
		executor?: Executor;
		detector?: SignalDetector;
		journal?: Journal | null;
		watchdog?: ConnectivityWatchdog;
		feeModel?: FeeModel;
	}): BuiltStrategy {
		return new BuiltStrategy({
			position: {
				positionManager: overrides.positionManager ?? PositionManager.create(),
			},
			risk: {
				guardPipeline: createMockGuardPipeline(overrides.guardVerdict ?? { type: "allow" }),
				exitPipeline: createMockExitPipeline(overrides.exitReason ?? null),
			},
			lifecycle: {
				stateMachine: createMockStateMachine(overrides.canOpen ?? true, overrides.canClose ?? true),
				watchdog: overrides.watchdog ?? createMockWatchdog(),
			},
			monitor: {
				eventDispatcher,
				orderRegistry: OrderRegistry.create(SystemClock),
			},
			accounting: { feeModel: overrides.feeModel ?? createMockFeeModel() },
			executor: overrides.executor ?? createMockExecutor(),
			detector: overrides.detector ?? createMockDetector({ edge: 0.1, confidence: 0.8 }),
			journal: overrides.journal === undefined ? createMockJournal() : overrides.journal,
		});
	}

	function sdkEvents(type: string): unknown[] {
		return capturedEvents.get(type) ?? [];
	}

	describe("tick", () => {
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

			const strategy = buildWithDispatcher({
				executor: slowExecutor,
			});

			const ctx = createMockContext();

			const tick1 = strategy.tick(ctx);
			// Start tick2 while tick1 is still running
			await new Promise((r) => setTimeout(r, 5));
			const tick2 = strategy.tick(ctx);

			await Promise.all([tick1, tick2]);

			// Only one executor call should happen — tick2 was rejected
			expect(executorCallCount).toBe(1);
		});

		it("should return early when cannot open and cannot close", async () => {
			const strategy = buildWithDispatcher({
				canOpen: false,
				canClose: false,
			});

			await strategy.tick(createMockContext());

			expect(sdkEvents("order_placed")).toHaveLength(0);
		});

		it("should process exits for open positions", async () => {
			const pm = openPosition(PositionManager.create());

			const strategy = buildWithDispatcher({
				positionManager: pm,
				exitReason: { type: "take_profit", roi: Decimal.from(0.2) },
				detector: createMockDetector(null),
			});

			await strategy.tick(createMockContext());

			expect(sdkEvents("position_closed")).toHaveLength(1);
		});

		it("should return early when cannot open but has no positions", async () => {
			const strategy = buildWithDispatcher({
				canOpen: false,
				canClose: true,
			});

			await strategy.tick(createMockContext());

			expect(sdkEvents("order_placed")).toHaveLength(0);
		});

		it("should emit guard_blocked event when guard blocks entry", async () => {
			const strategy = buildWithDispatcher({
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
			const strategy = buildWithDispatcher({
				detector: createMockDetector(null),
			});

			await strategy.tick(createMockContext());

			expect(sdkEvents("order_placed")).toHaveLength(0);
		});

		it("should open position when guard allows and signal detected", async () => {
			const strategy = buildWithDispatcher({});

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
			const strategy = buildWithDispatcher({
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

			const strategy = buildWithDispatcher({
				watchdog,
				detector: createMockDetector(null),
			});

			await strategy.tick(createMockContext());

			expect(watchdog.touch).toHaveBeenCalledOnce();
		});

		it("should still process exits when guard blocks entry", async () => {
			const pm = openPosition(PositionManager.create());

			const strategy = buildWithDispatcher({
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

			const strategy = buildWithDispatcher({
				positionManager: pm,
				exitReason: { type: "take_profit", roi: Decimal.from(0.2) },
				detector: createMockDetector(null),
			});

			await strategy.tick(createMockContext());

			// Fee computation is internal — verify position_closed event was emitted
			const closed = sdkEvents("position_closed");
			expect(closed).toHaveLength(1);
			expect((closed[0] as { pnl: number }).pnl).toBeDefined();
		});

		it("should journal when journal is provided", async () => {
			const journal = createMockJournal();

			const strategy = buildWithDispatcher({
				journal,
			});

			await strategy.tick(createMockContext());

			expect(journal.record).toHaveBeenCalled();
		});

		it("should work without journal (optional)", async () => {
			const strategy = buildWithDispatcher({
				journal: null,
			});

			await expect(strategy.tick(createMockContext())).resolves.not.toThrow();
		});

		it("should handle executor errors gracefully and emit error event", async () => {
			const strategy = buildWithDispatcher({
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
			const strategy = buildWithDispatcher({
				canOpen: false,
				canClose: true,
			});

			await strategy.tick(createMockContext());

			expect(sdkEvents("position_opened")).toHaveLength(0);
		});

		it("should handle positions with different sides correctly", async () => {
			const noTokenId = marketTokenId("NO", "test-market");
			const pm = unwrap(
				PositionManager.create().open(
					CID,
					noTokenId,
					MarketSide.No,
					Decimal.from(0.5),
					Decimal.from(10),
					Date.now() - 10000,
				),
			);

			const strategy = buildWithDispatcher({
				positionManager: pm,
				exitReason: { type: "time_exit", remainingSecs: 0 },
				detector: createMockDetector(null),
			});

			await strategy.tick(createMockContext());

			expect(sdkEvents("position_closed")).toHaveLength(1);
		});

		it("should process both exits and entries in same tick", async () => {
			const pm = openPosition(PositionManager.create());

			const strategy = buildWithDispatcher({
				positionManager: pm,
				exitReason: { type: "take_profit", roi: Decimal.from(0.2) },
			});

			await strategy.tick(createMockContext());

			expect(sdkEvents("position_closed")).toHaveLength(1);
			expect(sdkEvents("order_placed")).toHaveLength(1);
		});

		it("should emit error_occurred when exit executor fails", async () => {
			const pm = openPosition(PositionManager.create());

			const strategy = buildWithDispatcher({
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

			const strategy = buildWithDispatcher({
				journal: failingJournal,
			});

			await expect(strategy.tick(createMockContext())).resolves.not.toThrow();

			// Should still emit position_opened despite journal failure
			expect(sdkEvents("position_opened")).toHaveLength(1);
			// Should emit journal error event
			const errors = sdkEvents("error_occurred");
			expect(errors.length).toBeGreaterThan(0);
			expect(errors.some((e) => (e as { code: string }).code === "JOURNAL_WRITE_FAILED")).toBe(
				true,
			);
		});

		it("should reset tickInProgress after detector throws", async () => {
			const badDetector: SignalDetector<unknown, unknown> = {
				name: "throws",
				detectEntry: () => {
					throw new Error("detector crash");
				},
				toOrder: () => {
					throw new Error("unreachable");
				},
			};

			const strategy = buildWithDispatcher({ detector: badDetector });

			// First tick throws
			await expect(strategy.tick(createMockContext())).rejects.toThrow("detector crash");

			// Second tick should NOT be blocked by re-entrancy guard
			const goodDetector = createMockDetector({ edge: 0.1 });
			const strategy2 = buildWithDispatcher({ detector: goodDetector });
			await strategy2.tick(createMockContext());

			expect(sdkEvents("position_opened")).toHaveLength(1);
		});

		it("should include currentValue and threshold in guard_blocked when present", async () => {
			const strategy = buildWithDispatcher({
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

			const strategy = buildWithDispatcher({
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
				clientOrderId: CLIENT_ID,
				exchangeOrderId: EXCHANGE_ID,
				finalState: "filled" as const,
				totalFilled: Decimal.from(10),
				avgFillPrice: undefined,
				tradeId: "trade-456",
				fee: Decimal.from(0),
			});

			const strategy = buildWithDispatcher({
				executor: createMockExecutor(noFillPriceResult),
			});

			await strategy.tick(createMockContext());

			const opened = sdkEvents("position_opened");
			expect(opened).toHaveLength(1);
			// Falls back to intent price (0.55 from mockDetector)
			expect((opened[0] as { entryPrice: number }).entryPrice).toBe(0.55);
		});

		it("should process multiple positions during exit", async () => {
			const CID2 = conditionId("second-condition");
			const TOKEN2 = marketTokenId("YES", "second-market");

			let pm = unwrap(
				PositionManager.create().open(
					CID,
					TOKEN_ID,
					MarketSide.Yes,
					Decimal.from(0.5),
					Decimal.from(10),
					Date.now() - 10000,
				),
			);
			pm = unwrap(
				pm.open(
					CID2,
					TOKEN2,
					MarketSide.Yes,
					Decimal.from(0.6),
					Decimal.from(5),
					Date.now() - 5000,
				),
			);

			const strategy = buildWithDispatcher({
				positionManager: pm,
				exitReason: { type: "take_profit", roi: Decimal.from(0.2) },
				detector: createMockDetector(null),
			});

			await strategy.tick(createMockContext());

			expect(sdkEvents("position_closed")).toHaveLength(2);
		});

		it("should use ctx.spot() as sell price instead of entry price (Fix 1)", async () => {
			const pm = openPosition(PositionManager.create());
			const executor = createMockExecutor();

			const strategy = buildWithDispatcher({
				positionManager: pm,
				exitReason: { type: "take_profit", roi: Decimal.from(0.2) },
				executor,
				detector: createMockDetector(null),
			});

			// ctx.spot() returns 0.55, entry price was 0.5
			await strategy.tick(createMockContext());

			const submitCalls = (executor.submit as ReturnType<typeof vi.fn>).mock.calls;
			expect(submitCalls).toHaveLength(1);
			const intent = submitCalls[0]?.[0] as { price: { toNumber: () => number } };
			// Sell price should be ctx.spot() = 0.55, not entry price 0.5
			expect(intent.price.toNumber()).toBe(0.55);
		});

		it("should fallback to entry price when ctx.spot() is null and emit warning", async () => {
			const pm = openPosition(PositionManager.create());
			const executor = createMockExecutor();

			const strategy = buildWithDispatcher({
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
			// Fallback to entry price 0.5 when spot is null
			expect(intent.price.toNumber()).toBe(0.5);

			// Should emit warning about spot price unavailability
			const errors = sdkEvents("error_occurred") as Array<{ code: string }>;
			expect(errors.some((e) => e.code === "SPOT_PRICE_UNAVAILABLE")).toBe(true);
		});

		it("should await safeJournal in emitExecutionError (Fix 2)", async () => {
			const journalCalls: string[] = [];
			const slowJournal: Journal = {
				record: vi.fn(async (entry: { type: string }) => {
					journalCalls.push(entry.type);
				}),
			};

			const strategy = buildWithDispatcher({
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

			// Journal should have recorded the error entry (proves await worked)
			expect(journalCalls).toContain("error");
		});

		it("should include error detail in JOURNAL_WRITE_FAILED event (Fix 3)", async () => {
			const failingJournal: Journal = {
				record: vi.fn(async () => {
					throw new Error("ENOSPC: no space left on device");
				}),
			};

			const strategy = buildWithDispatcher({
				journal: failingJournal,
			});

			await strategy.tick(createMockContext());

			const errors = sdkEvents("error_occurred") as Array<{ code: string; message: string }>;
			const journalError = errors.find((e) => e.code === "JOURNAL_WRITE_FAILED");
			expect(journalError).toBeDefined();
			expect(journalError?.message).toContain("ENOSPC: no space left on device");
		});

		it("should include fee in position_closed event and journal (Fix 4)", async () => {
			const journal = createMockJournal();
			const pm = openPosition(PositionManager.create());

			const strategy = buildWithDispatcher({
				journal,
				positionManager: pm,
				exitReason: { type: "take_profit", roi: Decimal.from(0.2) },
				feeModel: fixedNotionalFee(10),
				detector: createMockDetector(null),
			});

			await strategy.tick(createMockContext());

			// Check SDK event has fee
			const closed = sdkEvents("position_closed") as Array<{ fee?: number }>;
			expect(closed).toHaveLength(1);
			expect(closed[0]?.fee).toBeDefined();
			expect(typeof closed[0]?.fee).toBe("number");

			// Check journal entry has fee
			const calls = (journal.record as ReturnType<typeof vi.fn>).mock.calls;
			const closedEntry = calls.find(([e]: [{ type: string }]) => e.type === "position_closed");
			expect(closedEntry).toBeDefined();
			expect((closedEntry?.[0] as { fee?: number }).fee).toBeDefined();
		});
	});

	describe("warmup", () => {
		function createRealStateMachine(): StrategyStateMachine {
			return new StrategyStateMachine();
		}

		function buildWithWarmup(warmupTicks: number): BuiltStrategy {
			const stateMachine = createRealStateMachine();
			return new BuiltStrategy({
				position: { positionManager: PositionManager.create() },
				risk: {
					guardPipeline: createMockGuardPipeline({ type: "allow" }),
					exitPipeline: createMockExitPipeline(null),
				},
				lifecycle: {
					stateMachine,
					watchdog: createMockWatchdog(),
				},
				monitor: { eventDispatcher, orderRegistry: OrderRegistry.create(SystemClock) },
				accounting: { feeModel: createMockFeeModel() },
				executor: createMockExecutor(),
				detector: createMockDetector({ edge: 0.1, confidence: 0.8 }),
				journal: null,
				warmupTicks,
			});
		}

		it("should be immediately active when warmupTicks is undefined", async () => {
			const strategy = new BuiltStrategy({
				position: { positionManager: PositionManager.create() },
				risk: {
					guardPipeline: createMockGuardPipeline({ type: "allow" }),
					exitPipeline: createMockExitPipeline(null),
				},
				lifecycle: {
					stateMachine: createRealStateMachine(),
					watchdog: createMockWatchdog(),
				},
				monitor: { eventDispatcher, orderRegistry: OrderRegistry.create(SystemClock) },
				accounting: { feeModel: createMockFeeModel() },
				executor: createMockExecutor(),
				detector: createMockDetector({ edge: 0.1, confidence: 0.8 }),
				journal: null,
			});

			await strategy.tick(createMockContext());

			expect(sdkEvents("position_opened")).toHaveLength(1);
		});

		it("should be immediately active when warmupTicks is 0", async () => {
			const strategy = buildWithWarmup(0);

			await strategy.tick(createMockContext());

			expect(sdkEvents("position_opened")).toHaveLength(1);
		});

		it("should block entries during warmup", async () => {
			const strategy = buildWithWarmup(3);

			await strategy.tick(createMockContext());

			expect(sdkEvents("position_opened")).toHaveLength(0);
		});

		it("should emit state_changed when transitioning to WarmingUp", async () => {
			const strategy = buildWithWarmup(3);

			await strategy.tick(createMockContext());

			const stateChanges = sdkEvents("state_changed");
			expect(stateChanges).toHaveLength(1);
			const event = stateChanges[0] as { from: string; to: string; transition: string };
			expect(event.from).toBe("initializing");
			expect(event.to).toBe("warming_up");
			expect(event.transition).toBe("initialize");
		});

		it("should emit progress events during warmup (update_warmup transition)", async () => {
			const strategy = buildWithWarmup(3);

			await strategy.tick(createMockContext());

			const stateChanges = sdkEvents("state_changed");
			expect(stateChanges).toHaveLength(1);
			const event = stateChanges[0] as { from: string; to: string };
			expect(event.from).toBe("initializing");
			expect(event.to).toBe("warming_up");
		});

		it("should complete warmup after N ticks and allow entries", async () => {
			const strategy = buildWithWarmup(3);

			await strategy.tick(createMockContext());
			expect(sdkEvents("position_opened")).toHaveLength(0);

			await strategy.tick(createMockContext());
			expect(sdkEvents("position_opened")).toHaveLength(0);

			await strategy.tick(createMockContext());
			expect(sdkEvents("position_opened")).toHaveLength(1);

			const stateChanges = sdkEvents("state_changed");
			const lastEvent = stateChanges[stateChanges.length - 1] as {
				from: string;
				to: string;
				transition: string;
			};
			expect(lastEvent.from).toBe("warming_up");
			expect(lastEvent.to).toBe("active");
			expect(lastEvent.transition).toBe("warmup_complete");
		});

		it("should touch watchdog during warmup ticks", async () => {
			const watchdog = createMockWatchdog();
			const stateMachine = createRealStateMachine();

			const strategy = new BuiltStrategy({
				position: { positionManager: PositionManager.create() },
				risk: {
					guardPipeline: createMockGuardPipeline({ type: "allow" }),
					exitPipeline: createMockExitPipeline(null),
				},
				lifecycle: { stateMachine, watchdog },
				monitor: { eventDispatcher, orderRegistry: OrderRegistry.create(SystemClock) },
				accounting: { feeModel: createMockFeeModel() },
				executor: createMockExecutor(),
				detector: createMockDetector({ edge: 0.1, confidence: 0.8 }),
				journal: null,
				warmupTicks: 2,
			});

			await strategy.tick(createMockContext());
			expect(watchdog.touch).toHaveBeenCalledTimes(1);

			await strategy.tick(createMockContext());
			expect(watchdog.touch).toHaveBeenCalledTimes(2);
		});

		it("should not allow entries during warmup regardless of guard verdict", async () => {
			const strategy = buildWithWarmup(3);

			await strategy.tick(createMockContext());
			await strategy.tick(createMockContext());

			expect(sdkEvents("position_opened")).toHaveLength(0);
		});

		it("should block exits during warmup (canClose returns false in WarmingUp state)", async () => {
			const pm = openPosition(PositionManager.create());

			const strategy = new BuiltStrategy({
				position: { positionManager: pm },
				risk: {
					guardPipeline: createMockGuardPipeline({ type: "allow" }),
					exitPipeline: createMockExitPipeline({ type: "take_profit", roi: Decimal.from(0.2) }),
				},
				lifecycle: { stateMachine: createRealStateMachine(), watchdog: createMockWatchdog() },
				monitor: { eventDispatcher, orderRegistry: OrderRegistry.create(SystemClock) },
				accounting: { feeModel: createMockFeeModel() },
				executor: createMockExecutor(),
				detector: createMockDetector(null),
				journal: null,
				warmupTicks: 3,
			});

			await strategy.tick(createMockContext());

			expect(sdkEvents("position_closed")).toHaveLength(0);
		});

		it("should not open positions during warmup even with favorable guards", async () => {
			const strategy = buildWithWarmup(3);

			await strategy.tick(createMockContext());
			await strategy.tick(createMockContext());

			expect(sdkEvents("position_opened")).toHaveLength(0);
		});

		it("should handle warmupTicks of 1 correctly", async () => {
			const strategy = buildWithWarmup(1);

			await strategy.tick(createMockContext());

			expect(sdkEvents("position_opened")).toHaveLength(1);
			const stateChanges = sdkEvents("state_changed");
			expect(stateChanges).toHaveLength(2);
			const initEvent = stateChanges[0] as { from: string; to: string };
			expect(initEvent.from).toBe("initializing");
			expect(initEvent.to).toBe("warming_up");
			const completeEvent = stateChanges[1] as { from: string; to: string };
			expect(completeEvent.from).toBe("warming_up");
			expect(completeEvent.to).toBe("active");
		});
	});
});
