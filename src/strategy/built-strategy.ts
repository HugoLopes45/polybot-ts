/**
 * BuiltStrategy — the tick loop engine composing all 5 aggregates.
 *
 * Orchestrates: PositionAggregate, RiskAggregate, LifecycleAggregate,
 * MonitorAggregate, AccountingAggregate + Executor + SignalDetector + optional Journal
 */

import { computeFee } from "../accounting/fee-model.js";
import type { FeeModel } from "../accounting/fee-model.js";
import type { EventDispatcher } from "../events/event-dispatcher.js";
import type { Executor } from "../execution/types.js";
import type { ConnectivityWatchdog } from "../lifecycle/watchdog.js";
import type { PositionManager } from "../position/position-manager.js";
import type { SdkPosition } from "../position/sdk-position.js";
import type { GuardPipeline } from "../risk/guard-pipeline.js";
import type { GuardContext } from "../risk/types.js";
import type { TradingError } from "../shared/errors.js";
import { isErr } from "../shared/result.js";
import type { ExitPipeline } from "../signal/exit-pipeline.js";
import type { DetectorContextLike, SdkOrderIntent, SignalDetector } from "../signal/types.js";
import type { Journal } from "./journal.js";
import type {
	AccountingAggregate,
	LifecycleAggregate,
	MonitorAggregate,
	PositionAggregate,
	RiskAggregate,
} from "./types.js";

/**
 * TickContext — the full context required by the tick loop.
 *
 * Combines DetectorContextLike (signal detection) and GuardContext (guard evaluation).
 * DetectorContext from the context/ module satisfies this when fully configured.
 */
export type TickContext = DetectorContextLike & GuardContext;

/** All dependencies required to construct a BuiltStrategy. */
export interface BuiltStrategyDeps {
	position: PositionAggregate;
	risk: RiskAggregate;
	lifecycle: LifecycleAggregate;
	monitor: MonitorAggregate;
	accounting: AccountingAggregate;
	executor: Executor;
	detector: SignalDetector;
	journal: Journal | null;
}

/** Minimal view into strategy lifecycle state for the tick loop. */
export interface StateView {
	canOpen(): boolean;
	canClose(): boolean;
}

/** The tick-loop engine -- composes all aggregates and orchestrates signal detection, guard checks, entries, and exits. */
export class BuiltStrategy {
	// Intentionally mutable: PositionManager is immutable (open/close return new instances)
	private positionManager: PositionManager;
	private readonly guardPipeline: GuardPipeline;
	private readonly exitPipeline: ExitPipeline;
	private readonly watchdog: ConnectivityWatchdog;
	private readonly eventDispatcher: EventDispatcher;
	private readonly feeModel: FeeModel;
	private readonly executor: Executor;
	private readonly detector: SignalDetector;
	private readonly journal: Journal | null;
	private readonly stateView: StateView;

	private tickInProgress = false;

	public constructor(deps: BuiltStrategyDeps) {
		this.positionManager = deps.position.positionManager;
		this.guardPipeline = deps.risk.guardPipeline;
		this.exitPipeline = deps.risk.exitPipeline;
		this.stateView = {
			canOpen: () => deps.lifecycle.stateMachine.canOpen(),
			canClose: () => deps.lifecycle.stateMachine.canClose(),
		};
		this.watchdog = deps.lifecycle.watchdog;
		this.eventDispatcher = deps.monitor.eventDispatcher;
		this.feeModel = deps.accounting.feeModel;
		this.executor = deps.executor;
		this.detector = deps.detector;
		this.journal = deps.journal;
	}

	public async tick(ctx: TickContext): Promise<void> {
		if (this.tickInProgress) {
			return;
		}

		this.tickInProgress = true;

		try {
			this.watchdog.touch();

			if (!this.stateView.canOpen() && !this.stateView.canClose()) {
				return;
			}

			// Phase 1: Process exits for open positions
			if (this.stateView.canClose()) {
				await this.processExits(ctx);
			}

			// Phase 2: Attempt entry if allowed
			if (!this.stateView.canOpen()) {
				return;
			}

			const guardVerdict = this.guardPipeline.evaluate(ctx);
			if (guardVerdict.type === "block") {
				this.eventDispatcher.emitSdk({
					type: "guard_blocked",
					timestamp: Date.now(),
					guardName: guardVerdict.guard,
					reason: guardVerdict.reason,
					recoverable: guardVerdict.recoverable,
					...(guardVerdict.currentValue !== undefined && {
						currentValue: guardVerdict.currentValue,
					}),
					...(guardVerdict.threshold !== undefined && {
						threshold: guardVerdict.threshold,
					}),
				});

				await this.safeJournal({
					type: "guard_blocked",
					guardName: guardVerdict.guard,
					reason: guardVerdict.reason,
					timestamp: Date.now(),
				});

				return;
			}

			await this.processEntry(ctx);
		} finally {
			this.tickInProgress = false;
		}
	}

	private async processExits(ctx: TickContext): Promise<void> {
		const positions = this.positionManager.allOpen();
		for (const position of positions) {
			const exitReason = this.exitPipeline.evaluate(position, ctx);
			if (!exitReason) {
				continue;
			}

			const intent = this.buildSellIntent(position, ctx);
			const result = await this.executor.submit(intent);

			if (isErr(result)) {
				await this.emitExecutionError("exit_submit_failed", result.error, position.conditionId);
				continue;
			}

			const orderResult = result.value;
			const exitPrice = orderResult.avgFillPrice ?? intent.price;
			const closeResult = this.positionManager.close(position.conditionId, exitPrice, Date.now());

			if (!closeResult) {
				this.emitError("POSITION_CLOSE_FAILED", "Position close returned null after fill");
				continue;
			}

			this.positionManager = closeResult.manager;
			const fee = computeFee(this.feeModel, position.notional(), closeResult.pnl);

			this.eventDispatcher.emitSdk({
				type: "position_closed",
				timestamp: Date.now(),
				conditionId: position.conditionId,
				tokenId: position.tokenId,
				entryPrice: position.entryPrice.toNumber(),
				exitPrice: exitPrice.toNumber(),
				pnl: closeResult.pnl.toNumber(),
				reason: exitReason.type,
				fee: fee.toNumber(),
			});

			await this.safeJournal({
				type: "position_closed",
				conditionId: position.conditionId,
				entryPrice: position.entryPrice.toNumber(),
				exitPrice: exitPrice.toNumber(),
				pnl: closeResult.pnl.toNumber(),
				reason: exitReason.type,
				fee: fee.toNumber(),
				timestamp: Date.now(),
			});
		}
	}

	private async processEntry(ctx: TickContext): Promise<void> {
		const signal = this.detector.detectEntry(ctx);
		if (!signal) {
			return;
		}

		const intent = this.detector.toOrder(signal, ctx);
		const result = await this.executor.submit(intent);

		if (isErr(result)) {
			await this.emitExecutionError("entry_submit_failed", result.error, intent.conditionId);
			return;
		}

		const orderResult = result.value;
		const entryPrice = orderResult.avgFillPrice ?? intent.price;

		const openResult = this.positionManager.open(
			intent.conditionId,
			intent.tokenId,
			intent.side,
			entryPrice,
			intent.size,
			Date.now(),
		);

		if (isErr(openResult)) {
			// Real fill happened but position tracking failed — critical state desync
			this.emitError(
				"POSITION_OPEN_FAILED",
				`Position open failed after fill: ${openResult.error}`,
			);
			return;
		}

		this.positionManager = openResult.value;

		this.eventDispatcher.emitSdk({
			type: "position_opened",
			timestamp: Date.now(),
			conditionId: intent.conditionId,
			tokenId: intent.tokenId,
			side: intent.side,
			entryPrice: entryPrice.toNumber(),
			size: intent.size.toNumber(),
		});

		this.eventDispatcher.emitSdk({
			type: "order_placed",
			timestamp: Date.now(),
			clientOrderId: orderResult.clientOrderId,
			conditionId: intent.conditionId,
			tokenId: intent.tokenId,
			side: intent.side,
			price: intent.price.toNumber(),
			size: intent.size.toNumber(),
		});

		await this.safeJournal({
			type: "entry_signal",
			signal,
			intent,
			timestamp: Date.now(),
		});
		await this.safeJournal({
			type: "order_submitted",
			intent,
			clientOrderId: orderResult.clientOrderId,
			timestamp: Date.now(),
		});
		await this.safeJournal({
			type: "position_opened",
			conditionId: intent.conditionId,
			tokenId: intent.tokenId,
			side: intent.side,
			entryPrice: entryPrice.toNumber(),
			size: intent.size.toNumber(),
			timestamp: Date.now(),
		});
	}

	private buildSellIntent(position: SdkPosition, ctx: TickContext): SdkOrderIntent {
		const oppositeSide = position.side === "yes" ? "no" : "yes";
		return {
			conditionId: position.conditionId,
			tokenId: position.tokenId,
			side: oppositeSide,
			direction: "sell",
			price: ctx.spot() ?? position.entryPrice,
			size: position.size,
		};
	}

	private async emitExecutionError(
		code: string,
		error: TradingError,
		conditionId: unknown,
	): Promise<void> {
		this.eventDispatcher.emitSdk({
			type: "error_occurred",
			timestamp: Date.now(),
			code,
			message: error.message,
			category: error.category,
		});
		await this.safeJournal({
			type: "error",
			code,
			message: `${error.message} (condition: ${conditionId})`,
			timestamp: Date.now(),
		});
	}

	private emitError(code: string, message: string): void {
		this.eventDispatcher.emitSdk({
			type: "error_occurred",
			timestamp: Date.now(),
			code,
			message,
			category: "fatal",
		});
	}

	private async safeJournal(entry: Parameters<Journal["record"]>[0]): Promise<void> {
		if (!this.journal) return;
		try {
			await this.journal.record(entry);
		} catch (e: unknown) {
			const detail = e instanceof Error ? e.message : String(e);
			this.eventDispatcher.emitSdk({
				type: "error_occurred",
				timestamp: Date.now(),
				code: "JOURNAL_WRITE_FAILED",
				message: `Journal write failed for ${entry.type}: ${detail}`,
				category: "non_retryable",
			});
		}
	}
}
