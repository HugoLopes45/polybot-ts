import { beforeEach, describe, expect, it, vi } from "vitest";
import { fixedNotionalFee } from "../accounting/fee-model.js";
import { EventDispatcher } from "../events/event-dispatcher.js";
import { PaperExecutor } from "../execution/paper-executor.js";
import { OrderRegistry } from "../order/order-registry.js";
import { PositionManager } from "../position/position-manager.js";
import { GuardPipeline } from "../risk/guard-pipeline.js";
import { MaxSpreadGuard } from "../risk/guards/max-spread.js";
import { Decimal } from "../shared/decimal.js";
import {
	clientOrderId,
	conditionId,
	exchangeOrderId,
	marketTokenId,
} from "../shared/identifiers.js";
import { MarketSide } from "../shared/market-side.js";
import { err, ok } from "../shared/result.js";
import { FakeClock } from "../shared/time.js";
import { ExitPipeline } from "../signal/exit-pipeline.js";
import { StopLossExit } from "../signal/exits/stop-loss.js";
import { TakeProfitExit } from "../signal/exits/take-profit.js";
import type { SdkOrderIntent, SignalDetector } from "../signal/types.js";
import type { TickContext } from "../strategy/built-strategy.js";
import { BuiltStrategy } from "../strategy/built-strategy.js";

const CID1 = conditionId("cond-001");
const CID2 = conditionId("cond-002");
const CID3 = conditionId("cond-003");
const TOKEN1 = marketTokenId("YES-market-1");
const TOKEN2 = marketTokenId("YES-market-2");
const FIXED_NOW = 1000000000000;
const TOKEN3 = marketTokenId("YES-market-3");

function createDetector(
	signal: unknown,
	orderIntent?: Partial<SdkOrderIntent>,
): SignalDetector<unknown, unknown> {
	return {
		name: "test-detector",
		detectEntry: () => signal,
		toOrder: () => ({
			conditionId: CID1,
			tokenId: TOKEN1,
			side: MarketSide.Yes,
			direction: "buy" as const,
			price: Decimal.from(0.5),
			size: Decimal.from(10),
			...orderIntent,
		}),
	};
}

function createContext(
	bid: number,
	ask: number,
	oracle?: number,
	availableBalance = 1000,
	openPositions = 0,
): TickContext {
	const ctx: TickContext = {
		conditionId: CID1,
		nowMs: () => FIXED_NOW,
		spot: () => Decimal.from((bid + ask) / 2),
		oraclePrice: () => Decimal.from(oracle ?? (bid + ask) / 2),
		timeRemainingMs: () => 60000,
		bestBid: (_side: unknown) => Decimal.from(bid),
		bestAsk: (_side: unknown) => Decimal.from(ask),
		spread: (_side: unknown) => Decimal.from(ask - bid),
		spreadPct: (_side: unknown) => ((ask - bid) / ((bid + ask) / 2)) * 100,
		openPositionCount: () => openPositions,
		totalExposure: () => Decimal.zero(),
		availableBalance: () => Decimal.from(availableBalance),
		dailyPnl: () => Decimal.zero(),
		consecutiveLosses: () => 0,
		hasPendingOrderFor: (_cid: unknown, _side: unknown) => false,
		lastTradeTimeMs: (_cid: unknown) => null,
		oracleAgeMs: () => null,
		bookAgeMs: () => null,
	};
	return ctx;
}

function buildStrategy(
	clock: FakeClock,
	detector: SignalDetector,
	executor: PaperExecutor,
	options?: {
		guards?: GuardPipeline;
		exits?: ExitPipeline;
		warmupTicks?: number;
		feeModel?: ReturnType<typeof fixedNotionalFee>;
		slippageBps?: number;
	},
): { strategy: BuiltStrategy; events: EventDispatcher } {
	const eventDispatcher = new EventDispatcher();

	const warmupTicks = options?.warmupTicks ?? 0;
	let tickCount = 0;

	const stateMachine = {
		canOpen: () => tickCount >= warmupTicks,
		canClose: () => true,
		state: () => {
			if (warmupTicks > 0 && tickCount < warmupTicks) {
				return "warmingUp" as const;
			}
			return "active" as const;
		},
		transition: vi.fn((arg: { type: string; progressPct?: number }) => {
			if (arg.type === "update_warmup" && warmupTicks > 0) {
				tickCount++;
				return ok(undefined);
			}
			if (arg.type === "warmup_complete" || arg.type === "initialize") {
				return ok(undefined);
			}
			return ok(undefined);
		}),
	};

	const strategy = new BuiltStrategy({
		position: { positionManager: PositionManager.create() },
		risk: {
			guardPipeline: options?.guards ?? GuardPipeline.create().with(MaxSpreadGuard.wide()),
			exitPipeline: options?.exits ?? ExitPipeline.create(),
		},
		lifecycle: {
			stateMachine,
			watchdog: {
				touch: vi.fn(),
				check: vi.fn(() => ({ status: "ok", stale: false })),
				status: vi.fn(() => ({ status: "ok", stale: false, lastTouchMs: FIXED_NOW })),
				shouldBlockEntries: vi.fn(() => false),
			},
		},
		monitor: {
			eventDispatcher,
			orderRegistry: OrderRegistry.create(clock),
		},
		accounting: { feeModel: options?.feeModel ?? fixedNotionalFee(0) },
		executor,
		detector,
		journal: null,
		clock,
		...(options?.warmupTicks !== undefined && { warmupTicks: options.warmupTicks }),
	});
	return { strategy, events: eventDispatcher };
}

describe("BuiltStrategy — Full Lifecycle Integration", () => {
	let clock: FakeClock;
	let capturedEvents: Map<string, unknown[]>;

	beforeEach(() => {
		clock = new FakeClock(1000);
		capturedEvents = new Map();
	});

	function sdkEvents(_dispatcher: EventDispatcher, type: string): unknown[] {
		return capturedEvents.get(type) ?? [];
	}

	describe("1. Strategy lifecycle: entry → exit", () => {
		it("should open and close a position through full pipeline", async () => {
			const executor = new PaperExecutor({ clock });
			const detector = createDetector({ edge: 0.1 });
			const { strategy, events } = buildStrategy(clock, detector, executor, {
				exits: ExitPipeline.create().with(TakeProfitExit.normal()),
			});

			events.onSdk("*", (event) => {
				const list = capturedEvents.get(event.type) ?? [];
				list.push(event);
				capturedEvents.set(event.type, list);
			});

			await strategy.tick(createContext(0.5, 0.51));
			expect(sdkEvents(events, "position_opened")).toHaveLength(1);

			await strategy.tick(createContext(0.6, 0.61));
			expect(sdkEvents(events, "position_closed")).toHaveLength(1);

			const closedEvents = sdkEvents(events, "position_closed") as Array<{ pnl: number }>;
			expect(closedEvents[0]?.pnl).toBeGreaterThan(0);
		});

		it("should handle guard blocks entry but still allow subsequent entries", async () => {
			const executor = new PaperExecutor({ clock });
			const detector = createDetector({ edge: 0.1 });

			let guardCall = 0;
			const flakyGuard: GuardPipeline = {
				evaluate: () => {
					guardCall++;
					if (guardCall === 1) {
						return {
							type: "block",
							guard: "max_spread",
							reason: "spread too wide",
							recoverable: true,
						};
					}
					return { type: "allow" };
				},
				isEmpty: () => false,
				len: () => 1,
				guardNames: () => ["flaky-guard"],
				requireGuards: () => ({}) as GuardPipeline,
				with: () => ({}) as GuardPipeline,
			} as unknown as GuardPipeline;

			const { strategy, events } = buildStrategy(clock, detector, executor, {
				guards: flakyGuard,
			});

			events.onSdk("*", (event) => {
				const list = capturedEvents.get(event.type) ?? [];
				list.push(event);
				capturedEvents.set(event.type, list);
			});

			await strategy.tick(createContext(0.5, 0.56));
			expect(sdkEvents(events, "guard_blocked")).toHaveLength(1);
			expect(sdkEvents(events, "position_opened")).toHaveLength(0);

			await strategy.tick(createContext(0.5, 0.51));
			expect(sdkEvents(events, "position_opened")).toHaveLength(1);
		});
	});

	describe("2. Multiple positions across markets", () => {
		it("should handle multiple concurrent positions and close individually", async () => {
			const executor = new PaperExecutor({ clock });

			let callCount = 0;
			const multiMarketDetector: SignalDetector<unknown, unknown> = {
				name: "multi-market",
				detectEntry: () => ({ edge: 0.1 }),
				toOrder: () => {
					callCount++;
					if (callCount === 1) {
						return {
							conditionId: CID1,
							tokenId: TOKEN1,
							side: MarketSide.Yes,
							direction: "buy" as const,
							price: Decimal.from(0.5),
							size: Decimal.from(10),
						};
					}
					if (callCount === 2) {
						return {
							conditionId: CID2,
							tokenId: TOKEN2,
							side: MarketSide.Yes,
							direction: "buy" as const,
							price: Decimal.from(0.5),
							size: Decimal.from(10),
						};
					}
					return {
						conditionId: CID3,
						tokenId: TOKEN3,
						side: MarketSide.Yes,
						direction: "buy" as const,
						price: Decimal.from(0.5),
						size: Decimal.from(10),
					};
				},
			};

			const { strategy, events } = buildStrategy(clock, multiMarketDetector, executor, {
				exits: ExitPipeline.create().with(StopLossExit.create(Decimal.from(0.02))),
			});

			events.onSdk("*", (event) => {
				const list = capturedEvents.get(event.type) ?? [];
				list.push(event);
				capturedEvents.set(event.type, list);
			});

			await strategy.tick(createContext(0.5, 0.51));
			expect(sdkEvents(events, "position_opened")).toHaveLength(1);

			await strategy.tick(createContext(0.5, 0.51));
			expect(sdkEvents(events, "position_opened")).toHaveLength(2);

			await strategy.tick(createContext(0.5, 0.51));
			expect(sdkEvents(events, "position_opened")).toHaveLength(3);

			await strategy.tick(createContext(0.48, 0.49));
			expect(sdkEvents(events, "position_closed")).toHaveLength(3);
		});
	});

	describe("3. Error recovery does not break future ticks", () => {
		it("should continue functioning after executor error", async () => {
			let attempt = 0;
			const resilientExecutor = {
				submit: async (_intent: SdkOrderIntent) => {
					attempt++;
					if (attempt <= 2) {
						return err({
							code: "NETWORK_ERROR",
							message: "transient failure",
							category: "retryable",
						} as never);
					}
					return ok({
						clientOrderId: clientOrderId(`cid-${attempt}`),
						exchangeOrderId: exchangeOrderId(`eoid-${attempt}`),
						finalState: "filled" as const,
						totalFilled: Decimal.from(10),
						avgFillPrice: Decimal.from(0.5),
						tradeId: `trade-${attempt}`,
						fee: Decimal.from(0),
					});
				},
				cancel: async () => ok(undefined),
			};

			const detector = createDetector({ edge: 0.1 });
			const { strategy, events } = buildStrategy(clock, detector, resilientExecutor as never);

			events.onSdk("*", (event) => {
				const list = capturedEvents.get(event.type) ?? [];
				list.push(event);
				capturedEvents.set(event.type, list);
			});

			await strategy.tick(createContext(0.5, 0.51));
			expect(sdkEvents(events, "error_occurred")).toHaveLength(1);

			await strategy.tick(createContext(0.5, 0.51));
			expect(sdkEvents(events, "error_occurred")).toHaveLength(2);

			await strategy.tick(createContext(0.5, 0.51));
			expect(sdkEvents(events, "position_opened")).toHaveLength(1);
			expect(attempt).toBe(3);
		});

		it("should emit correct SDK events throughout lifecycle", async () => {
			const executor = new PaperExecutor({ clock, slippageBps: 100 });
			const detector = createDetector({ edge: 0.1 });
			const { strategy, events } = buildStrategy(clock, detector, executor, {
				exits: ExitPipeline.create().with(TakeProfitExit.normal()),
			});

			events.onSdk("*", (event) => {
				const list = capturedEvents.get(event.type) ?? [];
				list.push(event);
				capturedEvents.set(event.type, list);
			});

			await strategy.tick(createContext(0.5, 0.51));

			expect(sdkEvents(events, "order_placed")).toHaveLength(1);
			expect(sdkEvents(events, "position_opened")).toHaveLength(1);

			const openEvent = sdkEvents(events, "position_opened")[0] as {
				conditionId: unknown;
				tokenId: unknown;
				entryPrice: number;
				size: number;
			};
			expect(openEvent.conditionId).toBe(CID1);
			expect(openEvent.entryPrice).toBeCloseTo(0.505, 3);
			expect(openEvent.size).toBe(10);

			await strategy.tick(createContext(0.6, 0.61));

			expect(sdkEvents(events, "order_placed")).toHaveLength(3);
			expect(sdkEvents(events, "position_closed")).toHaveLength(1);

			const closeEvent = sdkEvents(events, "position_closed")[0] as {
				pnl: number;
				reason: string;
			};
			expect(closeEvent.pnl).toBeGreaterThan(0);
			expect(closeEvent.reason).toBe("take_profit");
		});
	});

	describe("4. Guard and exit combinations", () => {
		it("should block entry but still process exits when guard blocks", async () => {
			const executor = new PaperExecutor({ clock });
			const detector = createDetector({ edge: 0.1 });
			const { strategy, events } = buildStrategy(clock, detector, executor, {
				guards: GuardPipeline.create().with(MaxSpreadGuard.tight()),
				exits: ExitPipeline.create().with(TakeProfitExit.normal()),
			});

			events.onSdk("*", (event) => {
				const list = capturedEvents.get(event.type) ?? [];
				list.push(event);
				capturedEvents.set(event.type, list);
			});

			await strategy.tick(createContext(0.5, 0.56));
			expect(sdkEvents(events, "guard_blocked")).toHaveLength(1);
			expect(sdkEvents(events, "position_opened")).toHaveLength(0);
		});
	});

	describe("5. Stats verification", () => {
		it("should correctly compute PnL for winning trade", async () => {
			const executor = new PaperExecutor({ clock, slippageBps: 100 });
			const detector = createDetector({ edge: 0.1 });
			const { strategy, events } = buildStrategy(clock, detector, executor, {
				exits: ExitPipeline.create().with(TakeProfitExit.normal()),
				feeModel: fixedNotionalFee(0),
			});

			events.onSdk("*", (event) => {
				const list = capturedEvents.get(event.type) ?? [];
				list.push(event);
				capturedEvents.set(event.type, list);
			});

			await strategy.tick(createContext(0.5, 0.51));
			const open1 = sdkEvents(events, "position_opened")[0] as { entryPrice: number };
			expect(open1.entryPrice).toBeCloseTo(0.505, 3);

			await strategy.tick(createContext(0.6, 0.61));
			const close1 = sdkEvents(events, "position_closed")[0] as { pnl: number };
			expect(close1.pnl).toBeGreaterThan(0);
		});
	});
});
