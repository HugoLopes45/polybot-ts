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
import { StrategyState, type StrategyStateMachine } from "../lifecycle/index.js";
import type { ConnectivityWatchdog } from "../lifecycle/watchdog.js";
import type { PositionManager } from "../position/position-manager.js";
import type { SdkPosition } from "../position/sdk-position.js";
import type { GuardPipeline } from "../risk/guard-pipeline.js";
import type { GuardContext, GuardVerdict } from "../risk/types.js";
import { Decimal } from "../shared/decimal.js";
import type { TradingError } from "../shared/errors.js";
import { isErr } from "../shared/result.js";
import type { Clock } from "../shared/time.js";
import { SystemClock } from "../shared/time.js";
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
export interface StrategyAggregates {
	position: PositionAggregate;
	risk: RiskAggregate;
	lifecycle: LifecycleAggregate;
	monitor: MonitorAggregate;
	accounting: AccountingAggregate;
	executor: Executor;
	detector: SignalDetector;
	journal: Journal | null;
	clock?: Clock | undefined;
	warmupTicks?: number | undefined;
	maxSlippageBps?: number | undefined;
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
	private readonly stateMachine: StrategyStateMachine;
	private readonly stateView: StateView;
	private readonly watchdog: ConnectivityWatchdog;
	private readonly eventDispatcher: EventDispatcher;
	private readonly feeModel: FeeModel;
	private readonly executor: Executor;
	private readonly detector: SignalDetector;
	private readonly journal: Journal | null;
	private readonly clock: Clock;
	private readonly warmupTicks: number;
	private readonly maxSlippageBps: number | undefined;
	private tickCount = 0;

	private tickInProgress = false;

	public constructor(deps: StrategyAggregates) {
		this.positionManager = deps.position.positionManager;
		this.guardPipeline = deps.risk.guardPipeline;
		this.exitPipeline = deps.risk.exitPipeline;
		this.stateMachine = deps.lifecycle.stateMachine;
		this.stateView = {
			canOpen: () => this.stateMachine.canOpen(),
			canClose: () => this.stateMachine.canClose(),
		};
		this.watchdog = deps.lifecycle.watchdog;
		this.eventDispatcher = deps.monitor.eventDispatcher;
		this.feeModel = deps.accounting.feeModel;
		this.executor = deps.executor;
		this.detector = deps.detector;
		this.journal = deps.journal;
		this.clock = deps.clock ?? SystemClock;
		this.warmupTicks = deps.warmupTicks ?? 0;
		this.maxSlippageBps = deps.maxSlippageBps;
	}

	/** Returns the guard pipeline. For testing purposes. */
	getGuardPipeline(): GuardPipeline {
		return this.guardPipeline;
	}

	public async tick(ctx: TickContext): Promise<void> {
		if (this.tickInProgress) {
			this.eventDispatcher.emitSdk({
				type: "tick_dropped",
				timestamp: this.clock.now(),
				reason: "tick already in progress (re-entrancy guard)",
			});
			return;
		}

		this.tickInProgress = true;

		try {
			const dataStale = this.watchdog.shouldBlockEntries();
			this.watchdog.touch();
			this.advanceLifecycle();

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

			if (dataStale) {
				this.eventDispatcher.emitSdk({
					type: "error_occurred",
					timestamp: this.clock.now(),
					code: "WATCHDOG_ALERT",
					message: "Data feed stale, blocking entries",
					category: "non_retryable",
				});
				return;
			}

			let guardVerdict: GuardVerdict;
			try {
				guardVerdict = this.guardPipeline.evaluate(ctx);
			} catch (e: unknown) {
				const detail = e instanceof Error ? e.message : String(e);
				this.eventDispatcher.emitSdk({
					type: "error_occurred",
					timestamp: this.clock.now(),
					code: "GUARD_THREW",
					message: `Guard pipeline threw: ${detail}`,
					category: "fatal",
				});
				return;
			}

			if (guardVerdict.type === "block") {
				this.eventDispatcher.emitSdk({
					type: "guard_blocked",
					timestamp: this.clock.now(),
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
					timestamp: this.clock.now(),
				});

				return;
			}

			await this.processEntry(ctx);
		} finally {
			this.tickInProgress = false;
		}
	}

	private advanceLifecycle(): void {
		const currentState = this.stateMachine.state();

		if (currentState === StrategyState.Initializing) {
			this.tryTransition("initialize", StrategyState.Initializing, StrategyState.WarmingUp);
		}

		if (this.stateMachine.state() === StrategyState.WarmingUp) {
			if (this.warmupTicks > 0) {
				this.tickCount++;
				const progressPct = Math.round((this.tickCount / this.warmupTicks) * 100);
				const warmupResult = this.stateMachine.transition({
					type: "update_warmup",
					progressPct,
				});
				if (!warmupResult.ok) {
					this.emitError(
						"STATE_TRANSITION_FAILED",
						`update_warmup failed: ${warmupResult.error.message}`,
					);
				}

				if (this.tickCount < this.warmupTicks) {
					return;
				}
			}

			this.tryTransition("warmup_complete", StrategyState.WarmingUp, StrategyState.Active);
		}
	}

	private tryTransition(
		type: "initialize" | "warmup_complete",
		from: StrategyState,
		to: StrategyState,
	): void {
		const result = this.stateMachine.transition({ type });
		if (result.ok) {
			this.eventDispatcher.emitSdk({
				type: "state_changed",
				from,
				to,
				transition: type,
				timestamp: this.clock.now(),
			});
		} else {
			this.emitError("STATE_TRANSITION_FAILED", `${type} failed: ${result.error.message}`);
		}
	}

	private async processExits(ctx: TickContext): Promise<void> {
		const positions = this.positionManager.allOpen();
		for (const position of positions) {
			try {
				const exitReason = this.exitPipeline.evaluate(position, ctx);
				if (!exitReason) {
					continue;
				}

				await this.safeJournal({
					type: "exit_signal",
					conditionId: position.conditionId,
					reason: exitReason,
					timestamp: this.clock.now(),
				});

				const intent = this.buildSellIntent(position, ctx);

				const result = await this.executor.submit(intent);

				if (isErr(result)) {
					await this.emitExecutionError("exit_submit_failed", result.error, position.conditionId);
					continue;
				}

				const orderResult = result.value;
				const exitPrice = orderResult.avgFillPrice ?? intent.price;

				const exitSlippageBps = this.checkSlippage(intent.price, exitPrice);
				if (exitSlippageBps !== null && exitSlippageBps > (this.maxSlippageBps ?? 0)) {
					this.eventDispatcher.emitSdk({
						type: "error_occurred",
						timestamp: this.clock.now(),
						code: "SLIPPAGE_WARNING",
						message: `Exit slippage ${exitSlippageBps.toFixed(1)} bps exceeds max ${this.maxSlippageBps} bps (intent=${intent.price.toString()} fill=${exitPrice.toString()})`,
						category: "non_retryable",
					});
				}

				const closeResult = this.positionManager.close(
					position.conditionId,
					exitPrice,
					this.clock.now(),
				);

				if (!closeResult) {
					this.emitError("POSITION_CLOSE_FAILED", "Position close returned null after fill");
					continue;
				}

				this.positionManager = closeResult.manager;
				const fee = computeFee(this.feeModel, position.notional(), closeResult.pnl);

				this.eventDispatcher.emitSdk({
					type: "order_placed",
					timestamp: this.clock.now(),
					clientOrderId: orderResult.clientOrderId,
					conditionId: intent.conditionId,
					tokenId: intent.tokenId,
					side: intent.side,
					price: intent.price.toNumber(),
					size: intent.size.toNumber(),
				});

				this.eventDispatcher.emitSdk({
					type: "position_closed",
					timestamp: this.clock.now(),
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
					timestamp: this.clock.now(),
				});
			} catch (e: unknown) {
				const detail = e instanceof Error ? e.message : String(e);
				this.eventDispatcher.emitSdk({
					type: "error_occurred",
					timestamp: this.clock.now(),
					code: "EXIT_PIPELINE_THREW",
					message: `Exit pipeline threw for ${position.conditionId}: ${detail}`,
					category: "non_retryable",
				});
			}
		}
	}

	private checkSlippage(intentPrice: Decimal, fillPrice: Decimal | null): number | null {
		if (!this.maxSlippageBps || !fillPrice) {
			return null;
		}
		if (intentPrice.isZero()) {
			return null;
		}
		return intentPrice.sub(fillPrice).div(intentPrice).mul(Decimal.from(10000)).abs().toNumber();
	}

	private async processEntry(ctx: TickContext): Promise<void> {
		try {
			const signal = this.detector.detectEntry(ctx);
			if (!signal) {
				return;
			}

			const intent = this.detector.toOrder(signal, ctx);

			if (intent.size.isZero() || intent.size.isNegative()) {
				this.emitError(
					"INVALID_INTENT",
					`Detector returned invalid size: ${intent.size.toString()}`,
				);
				return;
			}
			if (intent.price.isZero() || intent.price.isNegative()) {
				this.emitError(
					"INVALID_INTENT",
					`Detector returned invalid price: ${intent.price.toString()}`,
				);
				return;
			}

			const result = await this.executor.submit(intent);

			if (isErr(result)) {
				await this.emitExecutionError("entry_submit_failed", result.error, intent.conditionId);
				return;
			}

			const orderResult = result.value;
			const entryPrice = orderResult.avgFillPrice ?? intent.price;

			const entrySlippageBps = this.checkSlippage(intent.price, entryPrice);
			if (entrySlippageBps !== null && entrySlippageBps > (this.maxSlippageBps ?? 0)) {
				this.eventDispatcher.emitSdk({
					type: "error_occurred",
					timestamp: this.clock.now(),
					code: "SLIPPAGE_WARNING",
					message: `Entry slippage ${entrySlippageBps.toFixed(1)} bps exceeds max ${this.maxSlippageBps} bps (intent=${intent.price.toString()} fill=${entryPrice.toString()})`,
					category: "non_retryable",
				});
			}

			const openResult = this.positionManager.open(
				intent.conditionId,
				intent.tokenId,
				intent.side,
				entryPrice,
				intent.size,
				this.clock.now(),
			);

			if (isErr(openResult)) {
				this.emitError(
					"POSITION_OPEN_FAILED",
					`Position open failed after fill: ${openResult.error}`,
				);
				return;
			}

			this.positionManager = openResult.value;

			this.eventDispatcher.emitSdk({
				type: "order_placed",
				timestamp: this.clock.now(),
				clientOrderId: orderResult.clientOrderId,
				conditionId: intent.conditionId,
				tokenId: intent.tokenId,
				side: intent.side,
				price: intent.price.toNumber(),
				size: intent.size.toNumber(),
			});

			this.eventDispatcher.emitSdk({
				type: "position_opened",
				timestamp: this.clock.now(),
				conditionId: intent.conditionId,
				tokenId: intent.tokenId,
				side: intent.side,
				entryPrice: entryPrice.toNumber(),
				size: intent.size.toNumber(),
			});

			await this.safeJournal({
				type: "entry_signal",
				signal,
				intent,
				timestamp: this.clock.now(),
			});
			await this.safeJournal({
				type: "order_submitted",
				intent,
				clientOrderId: orderResult.clientOrderId,
				timestamp: this.clock.now(),
			});
			await this.safeJournal({
				type: "position_opened",
				conditionId: intent.conditionId,
				tokenId: intent.tokenId,
				side: intent.side,
				entryPrice: entryPrice.toNumber(),
				size: intent.size.toNumber(),
				timestamp: this.clock.now(),
			});
		} catch (e: unknown) {
			const detail = e instanceof Error ? e.message : String(e);
			this.eventDispatcher.emitSdk({
				type: "error_occurred",
				timestamp: this.clock.now(),
				code: "DETECTOR_THREW",
				message: `Detector threw: ${detail}`,
				category: "non_retryable",
			});
		}
	}

	private buildSellIntent(position: SdkPosition, ctx: TickContext): SdkOrderIntent {
		const oppositeSide = position.side === "yes" ? "no" : "yes";
		const spotPrice = ctx.spot();
		if (spotPrice === null) {
			this.eventDispatcher.emitSdk({
				type: "error_occurred",
				timestamp: this.clock.now(),
				code: "SPOT_PRICE_UNAVAILABLE",
				message: `Using entry price as fallback for exit on ${position.conditionId}`,
				category: "non_retryable",
			});
		}
		return {
			conditionId: position.conditionId,
			tokenId: position.tokenId,
			side: oppositeSide,
			direction: "sell",
			price: spotPrice ?? position.entryPrice,
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
			timestamp: this.clock.now(),
			code,
			message: error.message,
			category: error.category,
		});
		await this.safeJournal({
			type: "error",
			code,
			message: `${error.message} (condition: ${conditionId})`,
			timestamp: this.clock.now(),
		});
	}

	private emitError(code: string, message: string): void {
		this.eventDispatcher.emitSdk({
			type: "error_occurred",
			timestamp: this.clock.now(),
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
				timestamp: this.clock.now(),
				code: "JOURNAL_WRITE_FAILED",
				message: `Journal write failed for ${entry.type}: ${detail}`,
				category: "non_retryable",
			});
		}
	}
}
