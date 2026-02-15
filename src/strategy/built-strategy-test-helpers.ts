/**
 * Shared test helpers for BuiltStrategy tests.
 * Extracted to keep test files under 800 LOC.
 */

import { vi } from "vitest";
import type { FeeModel } from "../accounting/fee-model.js";
import { fixedNotionalFee } from "../accounting/fee-model.js";
import { EventDispatcher } from "../events/event-dispatcher.js";
import type { Executor } from "../execution/types.js";
import { StrategyStateMachine } from "../lifecycle/state-machine.js";
import type { ConnectivityWatchdog as ConnectivityWatchdogType } from "../lifecycle/watchdog.js";
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
import { ok, unwrap } from "../shared/result.js";
import { SystemClock } from "../shared/time.js";
import { ExitPipeline } from "../signal/exit-pipeline.js";
import type { ExitReason, SignalDetector } from "../signal/types.js";
import { BuiltStrategy } from "./built-strategy.js";
import type { TickContext } from "./built-strategy.js";
import type { Journal } from "./journal.js";

export const CID = conditionId("test-condition");
export const TOKEN_ID = marketTokenId("YES-test-market");
export const CLIENT_ID = clientOrderId("client-123");
export const EXCHANGE_ID = exchangeOrderId("exchange-456");

export const FILLED_RESULT = ok({
	clientOrderId: CLIENT_ID,
	exchangeOrderId: EXCHANGE_ID,
	finalState: "filled" as const,
	totalFilled: Decimal.from(10),
	avgFillPrice: Decimal.from(0.55),
	tradeId: "trade-123",
	fee: Decimal.from(0.1),
});

export function createMockExecutor(result?: Awaited<ReturnType<Executor["submit"]>>): Executor {
	const r = result ?? FILLED_RESULT;
	return {
		submit: vi.fn(async () => r),
		cancel: vi.fn(async () => ok(undefined)),
	};
}

export function createMockDetector(signal: unknown): SignalDetector<unknown, unknown> {
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

export function createMockGuardPipeline(verdict: GuardVerdict): GuardPipeline {
	return {
		evaluate: vi.fn(() => verdict),
		isEmpty: () => false,
		len: () => 1,
		guardNames: () => ["mock-guard"],
		requireGuards: () => ({}) as GuardPipeline,
		with: () => ({}) as GuardPipeline,
	} as unknown as GuardPipeline;
}

export function createMockExitPipeline(reason: ExitReason | null): ExitPipeline {
	return {
		evaluate: vi.fn(() => reason),
		isEmpty: () => false,
		len: () => 1,
		policyNames: () => ["mock-exit"],
		requireExits: () => ExitPipeline.create(),
		with: () => ExitPipeline.create(),
	} as unknown as ExitPipeline;
}

export function createMockWatchdog(): ConnectivityWatchdogType {
	return {
		touch: vi.fn(),
		check: vi.fn(() => ({ status: "ok", stale: false })),
		status: vi.fn(() => ({ status: "ok", stale: false, lastTouchMs: Date.now() })),
		shouldBlockEntries: vi.fn(() => false),
	} as unknown as ConnectivityWatchdogType;
}

export function createMockStateMachine(canOpen = true, canClose = true): StrategyStateMachine {
	return {
		canOpen: vi.fn(() => canOpen),
		canClose: vi.fn(() => canClose),
		state: vi.fn(() => "active" as const),
		transition: vi.fn(),
	} as unknown as StrategyStateMachine;
}

export function createMockFeeModel(): FeeModel {
	return fixedNotionalFee(10);
}

export function createMockJournal(): Journal {
	return {
		record: vi.fn(async () => {}),
		flush: vi.fn(async () => {}),
	};
}

export function createMockContext(overrides?: Partial<TickContext>): TickContext {
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

export function openPosition(pm: PositionManager): PositionManager {
	return unwrap(
		pm.open(CID, TOKEN_ID, MarketSide.Yes, Decimal.from(0.5), Decimal.from(10), Date.now() - 10000),
	);
}

export interface BuildOverrides {
	positionManager?: PositionManager;
	guardPipeline?: GuardPipeline;
	guardVerdict?: GuardVerdict;
	exitReason?: ExitReason | null;
	exitPipeline?: ExitPipeline;
	canOpen?: boolean;
	canClose?: boolean;
	executor?: Executor;
	detector?: SignalDetector;
	journal?: Journal | null;
	watchdog?: ConnectivityWatchdogType;
	feeModel?: FeeModel;
	clock?: import("../shared/time.js").Clock;
	stateMachine?: StrategyStateMachine;
	maxSlippageBps?: number;
}

export function buildWithDispatcher(
	eventDispatcher: EventDispatcher,
	overrides: BuildOverrides,
): BuiltStrategy {
	return new BuiltStrategy({
		position: {
			positionManager: overrides.positionManager ?? PositionManager.create(),
		},
		risk: {
			guardPipeline:
				overrides.guardPipeline ??
				createMockGuardPipeline(overrides.guardVerdict ?? { type: "allow" }),
			exitPipeline: overrides.exitPipeline ?? createMockExitPipeline(overrides.exitReason ?? null),
		},
		lifecycle: {
			stateMachine:
				overrides.stateMachine ??
				createMockStateMachine(overrides.canOpen ?? true, overrides.canClose ?? true),
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
		...(overrides.clock !== undefined && { clock: overrides.clock }),
		...(overrides.maxSlippageBps !== undefined && { maxSlippageBps: overrides.maxSlippageBps }),
	});
}

export {
	BuiltStrategy,
	type ConnectivityWatchdogType,
	Decimal,
	EventDispatcher,
	ExitPipeline,
	MarketSide,
	OrderRegistry,
	PositionManager,
	StrategyStateMachine,
	SystemClock,
};
export type { GuardPipeline, GuardVerdict, ExitReason, SignalDetector, Journal, TickContext };
