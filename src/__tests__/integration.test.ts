import { beforeEach, describe, expect, it } from "vitest";
import { fixedNotionalFee } from "../accounting/fee-model.js";
import { PaperExecutor } from "../execution/paper-executor.js";
import type { Executor } from "../execution/types.js";
import { MemoryJournal } from "../persistence/memory-journal.js";
import { GuardPipeline } from "../risk/guard-pipeline.js";
import { MaxSpreadGuard } from "../risk/guards/max-spread.js";
import { Decimal } from "../shared/decimal.js";
import { OrderRejectedError } from "../shared/errors.js";
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
import { StrategyBuilder } from "../strategy/strategy-builder.js";

const CID1 = conditionId("cond-001");
const CID2 = conditionId("cond-002");
const TOKEN1 = marketTokenId("market-1");
const TOKEN2 = marketTokenId("market-2");
const FIXED_NOW = 1000000000000;

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

interface TestTickContextParams {
	bid?: number;
	ask?: number;
	oracle?: number;
}

function createContext(params?: TestTickContextParams): TickContext {
	const bid = params?.bid ?? 0.5;
	const ask = params?.ask ?? 0.51;
	const oracle = params?.oracle ?? 0.505;

	const ctx: TickContext = {
		conditionId: CID1,
		nowMs: () => FIXED_NOW,
		spot: () => Decimal.from((bid + ask) / 2),
		oraclePrice: () => Decimal.from(oracle),
		timeRemainingMs: () => 60000,
		bestBid: (_side: unknown) => Decimal.from(bid),
		bestAsk: (_side: unknown) => Decimal.from(ask),
		spread: (_side: unknown) => Decimal.from(ask - bid),
		spreadPct: (_side: unknown) => ((ask - bid) / ((bid + ask) / 2)) * 100,
		openPositionCount: () => 0,
		totalExposure: () => Decimal.zero(),
		availableBalance: () => Decimal.from(1000),
		dailyPnl: () => Decimal.zero(),
		consecutiveLosses: () => 0,
		hasPendingOrderFor: (_cid: unknown, _side: unknown) => false,
		lastTradeTimeMs: (_cid: unknown) => null,
		oracleAgeMs: () => null,
		bookAgeMs: () => null,
	};

	return ctx;
}

describe("Integration: Full Pipeline", () => {
	let clock: FakeClock;

	beforeEach(() => {
		clock = new FakeClock(1000);
	});

	describe("1. Happy path: entry → exit", () => {
		it("should open and close a position through full pipeline", async () => {
			const executor = new PaperExecutor({ clock });
			const journal = new MemoryJournal();

			const strategy = StrategyBuilder.create()
				.withClock(clock)
				.withExecutor(executor)
				.withDetector(createDetector({ edge: 0.1 }))
				.withGuards(GuardPipeline.create().with(MaxSpreadGuard.wide()))
				.withExits(ExitPipeline.create().with(TakeProfitExit.normal()))
				.withJournal(journal)
				.build();

			await strategy.tick(createContext({ bid: 0.5, ask: 0.51 }));

			const entryJournal = journal.entries();
			expect(entryJournal.some((e) => e.type === "position_opened")).toBe(true);

			await strategy.tick(createContext({ bid: 0.6, ask: 0.61 }));

			const exitJournal = journal.entries();
			expect(exitJournal.some((e) => e.type === "position_closed")).toBe(true);

			const closedEntry = exitJournal.find((e) => e.type === "position_closed") as
				| { pnl: number }
				| undefined;
			expect(closedEntry?.pnl).toBeGreaterThan(0);
		});
	});

	describe("2. Guard blocks entry", () => {
		it("should journal guard_blocked when guard rejects", async () => {
			const executor = new PaperExecutor({ clock });
			const journal = new MemoryJournal();

			const strategy = StrategyBuilder.create()
				.withClock(clock)
				.withExecutor(executor)
				.withDetector(createDetector({ edge: 0.1 }))
				.withGuards(GuardPipeline.create().with(MaxSpreadGuard.tight()))
				.withExits(ExitPipeline.create())
				.withJournal(journal)
				.build();

			await strategy.tick(createContext({ bid: 0.5, ask: 0.56 }));

			const journalEntries = journal.entries();
			expect(journalEntries.some((e) => e.type === "guard_blocked")).toBe(true);

			const opened = journalEntries.filter((e) => e.type === "position_opened");
			expect(opened).toHaveLength(0);
		});
	});

	describe("3. Warmup delays trading", () => {
		it("should block entries during warmup, allow after", async () => {
			const executor = new PaperExecutor({ clock });
			const journal = new MemoryJournal();

			const strategy = StrategyBuilder.create()
				.withClock(clock)
				.withExecutor(executor)
				.withDetector(createDetector({ edge: 0.1 }))
				.withGuards(GuardPipeline.create().with(MaxSpreadGuard.wide()))
				.withExits(ExitPipeline.create())
				.withJournal(journal)
				.withWarmupTicks(3)
				.build();

			await strategy.tick(createContext());
			let entries = journal.entries();
			expect(entries.some((e) => e.type === "position_opened")).toBe(false);

			await strategy.tick(createContext());
			entries = journal.entries();
			expect(entries.some((e) => e.type === "position_opened")).toBe(false);

			await strategy.tick(createContext());
			entries = journal.entries();
			expect(entries.some((e) => e.type === "position_opened")).toBe(true);
		});
	});

	describe("4. Journal records events", () => {
		it("should record entry_signal, position_opened, and position_closed", async () => {
			const executor = new PaperExecutor({ clock });
			const journal = new MemoryJournal();

			const strategy = StrategyBuilder.create()
				.withClock(clock)
				.withExecutor(executor)
				.withDetector(createDetector({ edge: 0.1 }))
				.withGuards(GuardPipeline.create().with(MaxSpreadGuard.wide()))
				.withExits(ExitPipeline.create().with(TakeProfitExit.normal()))
				.withJournal(journal)
				.build();

			await strategy.tick(createContext({ bid: 0.5, ask: 0.51 }));

			await strategy.tick(createContext({ bid: 0.6, ask: 0.61 }));

			const entries = journal.entries();
			const types = entries.map((e) => e.type);

			expect(types).toContain("entry_signal");
			expect(types).toContain("position_opened");
			expect(types).toContain("position_closed");
		});
	});

	describe("5. Multiple positions", () => {
		it("should handle 2 markets, exit 1, correct PnL", async () => {
			const executor = new PaperExecutor({ clock });
			const journal = new MemoryJournal();

			let firstEntry = true;
			const multiDetector: SignalDetector<unknown, unknown> = {
				name: "multi",
				detectEntry: () => ({ edge: 0.1 }),
				toOrder: (_signal, _ctx) => {
					if (firstEntry) {
						firstEntry = false;
						return {
							conditionId: CID1,
							tokenId: TOKEN1,
							side: MarketSide.Yes,
							direction: "buy" as const,
							price: Decimal.from(0.5),
							size: Decimal.from(10),
						};
					}
					return {
						conditionId: CID2,
						tokenId: TOKEN2,
						side: MarketSide.Yes,
						direction: "buy" as const,
						price: Decimal.from(0.5),
						size: Decimal.from(10),
					};
				},
			};

			const strategy = StrategyBuilder.create()
				.withClock(clock)
				.withExecutor(executor)
				.withDetector(multiDetector)
				.withGuards(GuardPipeline.create().with(MaxSpreadGuard.wide()))
				.withExits(ExitPipeline.create().with(StopLossExit.create(Decimal.from(0.01))))
				.withJournal(journal)
				.build();

			await strategy.tick(createContext({ bid: 0.5, ask: 0.51 }));
			let entries = journal.entries();
			expect(entries.filter((e) => e.type === "position_opened")).toHaveLength(1);

			await strategy.tick(createContext({ bid: 0.48, ask: 0.49 }));
			entries = journal.entries();
			expect(entries.filter((e) => e.type === "position_closed")).toHaveLength(1);

			const closed = entries.find((e) => e.type === "position_closed") as
				| { pnl: number }
				| undefined;
			expect(closed?.pnl).toBeLessThan(0);
		});
	});

	describe("6. Error recovery", () => {
		it("should journal error when executor rejects", async () => {
			let attempt = 0;
			const failingExecutor: Executor = {
				submit: async (_intent) => {
					attempt++;
					if (attempt === 1) {
						return err(new OrderRejectedError("retry", { orderId: "test" }));
					}
					return ok({
						clientOrderId: clientOrderId(`cid-${attempt}`),
						exchangeOrderId: exchangeOrderId(`eoid-${attempt}`),
						finalState: "filled" as const,
						totalFilled: Decimal.from(10),
						avgFillPrice: Decimal.from(0.5),
					});
				},
				cancel: async () => ok(undefined),
			};

			const journal = new MemoryJournal();

			const strategy = StrategyBuilder.create()
				.withClock(clock)
				.withExecutor(failingExecutor)
				.withDetector(createDetector({ edge: 0.1 }))
				.withGuards(GuardPipeline.create().with(MaxSpreadGuard.wide()))
				.withExits(ExitPipeline.create())
				.withJournal(journal)
				.build();

			await strategy.tick(createContext());

			const entries = journal.entries();
			expect(entries.some((e) => e.type === "error")).toBe(true);
		});
	});

	describe("7. PaperExecutor fills", () => {
		it("should use correct avgFillPrice from PaperExecutor with slippage", async () => {
			const executor = new PaperExecutor({ clock, slippageBps: 100 });
			const journal = new MemoryJournal();

			const strategy = StrategyBuilder.create()
				.withClock(clock)
				.withExecutor(executor)
				.withDetector(createDetector({ edge: 0.1 }, { price: Decimal.from(0.5) }))
				.withGuards(GuardPipeline.create().with(MaxSpreadGuard.wide()))
				.withExits(ExitPipeline.create())
				.withFeeModel(fixedNotionalFee(0))
				.withJournal(journal)
				.build();

			await strategy.tick(createContext({ bid: 0.5, ask: 0.51 }));

			const entries = journal.entries();
			const opened = entries.find((e) => e.type === "position_opened") as
				| { entryPrice: number }
				| undefined;
			expect(opened?.entryPrice).toBeCloseTo(0.505, 2);
		});
	});
});
