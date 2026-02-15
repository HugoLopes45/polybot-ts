import { beforeEach, describe, expect, it, vi } from "vitest";
import { fixedNotionalFee } from "../accounting/fee-model.js";
import { ConnectivityWatchdog } from "../lifecycle/watchdog.js";
import { conditionId, marketTokenId } from "../shared/identifiers.js";
import { err, ok } from "../shared/result.js";
import { FakeClock } from "../shared/time.js";
import {
	type BuildOverrides,
	BuiltStrategy,
	CID,
	CLIENT_ID,
	Decimal,
	EXCHANGE_ID,
	EventDispatcher,
	type ExitPipeline,
	type GuardPipeline,
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

const FIXED_NOW = 1000000000000;

describe("BuiltStrategy — hardening", () => {
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
			FIXED_NOW - 5000,
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

	it("should warn on entry when slippage exceeds maxSlippageBps but still open position (H10)", async () => {
		const executor = createMockExecutor(
			ok({
				clientOrderId: CLIENT_ID,
				exchangeOrderId: EXCHANGE_ID,
				finalState: "filled" as const,
				totalFilled: Decimal.from(10),
				avgFillPrice: Decimal.from(0.6),
				tradeId: "trade-123",
				fee: Decimal.from(0.1),
			}),
		);

		const strategy = build({
			executor,
			maxSlippageBps: 500,
		});

		await strategy.tick(createMockContext({ spot: () => Decimal.from(0.3) }));

		const errors = sdkEvents("error_occurred") as Array<{ code: string }>;
		expect(errors.some((e) => e.code === "SLIPPAGE_WARNING")).toBe(true);
		expect(sdkEvents("position_opened")).toHaveLength(1);
	});

	it("should allow entry when slippage is within maxSlippageBps (H10)", async () => {
		const executor = createMockExecutor(
			ok({
				clientOrderId: CLIENT_ID,
				exchangeOrderId: EXCHANGE_ID,
				finalState: "filled" as const,
				totalFilled: Decimal.from(10),
				avgFillPrice: Decimal.from(0.56),
				tradeId: "trade-123",
				fee: Decimal.from(0.1),
			}),
		);

		const strategy = build({
			executor,
			maxSlippageBps: 500,
		});

		await strategy.tick(createMockContext({ spot: () => Decimal.from(0.55) }));

		const errors = sdkEvents("error_occurred") as Array<{ code: string }>;
		expect(errors.some((e) => e.code === "SLIPPAGE_WARNING")).toBe(false);
		expect(sdkEvents("position_opened")).toHaveLength(1);
	});

	it("should warn on exit when slippage exceeds maxSlippageBps but still close position (H10)", async () => {
		const executor = createMockExecutor(
			ok({
				clientOrderId: CLIENT_ID,
				exchangeOrderId: EXCHANGE_ID,
				finalState: "filled" as const,
				totalFilled: Decimal.from(10),
				avgFillPrice: Decimal.from(0.5),
				tradeId: "trade-123",
				fee: Decimal.from(0.1),
			}),
		);

		const pm = openPosition(PositionManager.create());
		const strategy = build({
			executor,
			positionManager: pm,
			exitReason: { type: "take_profit", roi: Decimal.from(0.2) },
			detector: createMockDetector(null),
			maxSlippageBps: 500,
		});

		await strategy.tick(createMockContext({ spot: () => Decimal.from(0.3) }));

		const errors = sdkEvents("error_occurred") as Array<{ code: string }>;
		expect(errors.some((e) => e.code === "SLIPPAGE_WARNING")).toBe(true);
		expect(sdkEvents("position_closed")).toHaveLength(1);
	});

	it("should allow exit when slippage is within maxSlippageBps (H10)", async () => {
		const executor = createMockExecutor(
			ok({
				clientOrderId: CLIENT_ID,
				exchangeOrderId: EXCHANGE_ID,
				finalState: "filled" as const,
				totalFilled: Decimal.from(10),
				avgFillPrice: Decimal.from(0.54),
				tradeId: "trade-123",
				fee: Decimal.from(0.1),
			}),
		);

		const pm = openPosition(PositionManager.create());
		const strategy = build({
			executor,
			positionManager: pm,
			exitReason: { type: "take_profit", roi: Decimal.from(0.2) },
			detector: createMockDetector(null),
			maxSlippageBps: 500,
		});

		await strategy.tick(createMockContext({ spot: () => Decimal.from(0.55) }));

		const errors = sdkEvents("error_occurred") as Array<{ code: string }>;
		expect(errors.some((e) => e.code === "SLIPPAGE_WARNING")).toBe(false);
		expect(sdkEvents("position_closed")).toHaveLength(1);
	});

	it("should emit tick_dropped when tick is already in progress (L2)", async () => {
		const ctx = createMockContext();

		let resolveFirst: (() => void) | null = null;
		const blockingExecutor = {
			submit: vi.fn(
				() =>
					new Promise<ReturnType<typeof ok>>((resolve) => {
						resolveFirst = () =>
							resolve(
								ok({
									clientOrderId: CLIENT_ID,
									exchangeOrderId: EXCHANGE_ID,
									finalState: "filled" as const,
									totalFilled: Decimal.from(10),
									avgFillPrice: Decimal.from(0.55),
									tradeId: "t1",
									fee: Decimal.from(0),
								}),
							);
					}),
			),
			cancel: vi.fn(async () => ok(undefined)),
		};

		const blockingStrategy = build({ executor: blockingExecutor });
		const firstTick = blockingStrategy.tick(ctx);
		await blockingStrategy.tick(ctx);

		const dropped = sdkEvents("tick_dropped") as Array<{ reason: string }>;
		expect(dropped).toHaveLength(1);
		expect(dropped[0]?.reason).toContain("re-entrancy");

		resolveFirst?.();
		await firstTick;
	});

	it("should allow entry/exit without maxSlippageBps configured (H10)", async () => {
		const executor = createMockExecutor(
			ok({
				clientOrderId: CLIENT_ID,
				exchangeOrderId: EXCHANGE_ID,
				finalState: "filled" as const,
				totalFilled: Decimal.from(10),
				avgFillPrice: Decimal.from(0.99),
				tradeId: "trade-123",
				fee: Decimal.from(0.1),
			}),
		);

		const pm = openPosition(PositionManager.create());
		const strategy = build({
			executor,
			positionManager: pm,
			exitReason: { type: "take_profit", roi: Decimal.from(0.2) },
		});

		await strategy.tick(createMockContext());

		expect(sdkEvents("position_opened")).toHaveLength(1);
		expect(sdkEvents("position_closed")).toHaveLength(1);
	});
});
