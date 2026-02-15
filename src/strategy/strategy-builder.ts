import { fixedNotionalFee } from "../accounting/fee-model.js";
import type { FeeModel } from "../accounting/fee-model.js";
import { EventDispatcher } from "../events/event-dispatcher.js";
import type { Executor } from "../execution/types.js";
import { createLogger } from "../lib/logger/index.js";
import { StrategyStateMachine } from "../lifecycle/state-machine.js";
import { ConnectivityWatchdog, DEFAULT_WATCHDOG_CONFIG } from "../lifecycle/watchdog.js";
import { OrderRegistry } from "../order/order-registry.js";
import { PendingState } from "../order/types.js";
import type { OrderResult } from "../order/types.js";
import { PositionManager } from "../position/position-manager.js";
import { GuardPipeline } from "../risk/guard-pipeline.js";
import { KillSwitchGuard } from "../risk/guards/kill-switch.js";
import { MaxPositionsGuard } from "../risk/guards/max-positions.js";
import type { SdkConfig } from "../shared/config.js";
import { DEFAULT_SDK_CONFIG, maxDailyLossUsdcToPct } from "../shared/config.js";
import { Decimal } from "../shared/decimal.js";
import { ConfigError, type TradingError } from "../shared/errors.js";
import { clientOrderId, exchangeOrderId } from "../shared/identifiers.js";
import { type Result, err, ok } from "../shared/result.js";
import type { Clock } from "../shared/time.js";
import { SystemClock } from "../shared/time.js";
import { ExitPipeline } from "../signal/exit-pipeline.js";
import type { SdkOrderIntent, SignalDetector } from "../signal/types.js";
import { BuiltStrategy } from "./built-strategy.js";
import type { StrategyAggregates } from "./built-strategy.js";
import type { Journal } from "./journal.js";
import type {
	AccountingAggregate,
	LifecycleAggregate,
	MonitorAggregate,
	PositionAggregate,
	RiskAggregate,
} from "./types.js";

function createDryRunExecutor(_realExecutor: Executor, clock: Clock): Executor {
	const logger = createLogger({ level: "info" });
	return {
		submit: async (intent: SdkOrderIntent): Promise<Result<OrderResult, TradingError>> => {
			logger.info(
				{
					direction: intent.direction,
					size: intent.size.toString(),
					side: intent.side,
					price: intent.price.toString(),
					conditionId: String(intent.conditionId),
					tokenId: String(intent.tokenId),
				},
				"[DRY RUN] Would submit order",
			);
			const ts = clock.now();
			const result: Result<OrderResult, TradingError> = {
				ok: true,
				value: {
					clientOrderId: clientOrderId(`dry-${ts}`),
					exchangeOrderId: exchangeOrderId(`dry-${ts}`),
					finalState: PendingState.Filled,
					totalFilled: intent.size,
					avgFillPrice: intent.price,
					tradeId: `dry-${ts}`,
					fee: Decimal.zero(),
				},
			};
			return result;
		},
		cancel: async (orderId): Promise<Result<void, TradingError>> => {
			logger.info({ orderId: String(orderId) }, "[DRY RUN] Would cancel order");
			return ok(undefined);
		},
	};
}

/** Optional dependency overrides for the StrategyBuilder. */
export interface StrategyComponents {
	clock?: Clock | undefined;
	executor?: Executor | undefined;
	feeModel?: FeeModel | undefined;
	journal?: Journal | null | undefined;
	guards?: GuardPipeline | undefined;
	exits?: ExitPipeline | undefined;
	detector?: SignalDetector | undefined;
	warmupTicks?: number | undefined;
	config?: SdkConfig | undefined;
	dryRun?: boolean | undefined;
}

/** Fluent, immutable builder for assembling a BuiltStrategy from its components. */
export class StrategyBuilder {
	private readonly clock: Clock;
	private readonly executor: Executor | undefined;
	private readonly feeModel: FeeModel | undefined;
	private readonly journal: Journal | null;
	private readonly guards: GuardPipeline | undefined;
	private readonly exits: ExitPipeline | undefined;
	private readonly detector: SignalDetector | undefined;
	private readonly warmupTicks: number | undefined;
	private readonly config: SdkConfig;
	private readonly dryRun: boolean;

	constructor(deps: StrategyComponents = {}) {
		this.clock = deps.clock ?? SystemClock;
		this.executor = deps.executor;
		this.feeModel = deps.feeModel;
		this.journal = deps.journal ?? null;
		this.guards = deps.guards;
		this.exits = deps.exits;
		this.detector = deps.detector;
		this.warmupTicks = deps.warmupTicks;
		this.config = deps.config ?? DEFAULT_SDK_CONFIG;
		this.dryRun = deps.dryRun ?? false;
	}

	static create(deps?: StrategyComponents): StrategyBuilder {
		return new StrategyBuilder(deps);
	}

	withClock(clock: Clock): StrategyBuilder {
		return new StrategyBuilder({ ...this.snapshot(), clock });
	}

	withGuards(guards: GuardPipeline): StrategyBuilder {
		return new StrategyBuilder({ ...this.snapshot(), guards });
	}

	withExits(exits: ExitPipeline): StrategyBuilder {
		return new StrategyBuilder({ ...this.snapshot(), exits });
	}

	withDetector(detector: SignalDetector): StrategyBuilder {
		return new StrategyBuilder({ ...this.snapshot(), detector });
	}

	withExecutor(executor: Executor): StrategyBuilder {
		return new StrategyBuilder({ ...this.snapshot(), executor });
	}

	withFeeModel(feeModel: FeeModel): StrategyBuilder {
		return new StrategyBuilder({ ...this.snapshot(), feeModel });
	}

	withJournal(journal: Journal): StrategyBuilder {
		return new StrategyBuilder({ ...this.snapshot(), journal });
	}

	withWarmupTicks(n: number): StrategyBuilder {
		return new StrategyBuilder({ ...this.snapshot(), warmupTicks: n });
	}

	withConfig(config: Partial<SdkConfig>): StrategyBuilder {
		const mergedConfig: SdkConfig = {
			...DEFAULT_SDK_CONFIG,
			...this.config,
			...config,
		};
		return new StrategyBuilder({ ...this.snapshot(), config: mergedConfig });
	}

	withDryRun(dryRun: boolean): StrategyBuilder {
		return new StrategyBuilder({ ...this.snapshot(), dryRun });
	}

	build(): BuiltStrategy {
		const positionAggregate: PositionAggregate = {
			positionManager: PositionManager.create(),
		};

		const guardPipeline = this.createGuardPipeline();
		const riskAggregate: RiskAggregate = {
			guardPipeline,
			exitPipeline: this.exits ?? ExitPipeline.create(),
		};

		const lifecycleAggregate: LifecycleAggregate = {
			stateMachine: new StrategyStateMachine(this.clock),
			watchdog: new ConnectivityWatchdog(DEFAULT_WATCHDOG_CONFIG, this.clock),
		};

		const eventDispatcher = this.createEventDispatcher();
		const monitorAggregate: MonitorAggregate = {
			eventDispatcher,
			orderRegistry: OrderRegistry.create(this.clock),
		};

		const accountingAggregate: AccountingAggregate = {
			feeModel: this.feeModel ?? fixedNotionalFee(0),
		};

		const realExecutor = this.executor ?? this.createDefaultExecutor();
		const executor = this.dryRun ? createDryRunExecutor(realExecutor, this.clock) : realExecutor;

		const deps: StrategyAggregates = {
			position: positionAggregate,
			risk: riskAggregate,
			lifecycle: lifecycleAggregate,
			monitor: monitorAggregate,
			accounting: accountingAggregate,
			executor,
			detector: this.detector ?? this.createDefaultDetector(),
			journal: this.journal,
			clock: this.clock,
			warmupTicks: this.warmupTicks,
			maxSlippageBps: this.config.maxSlippageBps,
		};

		return new BuiltStrategy(deps);
	}

	buildProduction(): Result<BuiltStrategy, string> {
		if (!this.detector) {
			return err("Strategy requires a detector");
		}
		if (!this.guards) {
			return err("Strategy requires at least one guard");
		}
		if (!this.exits) {
			return err("Strategy requires at least one exit policy");
		}
		if (!this.executor) {
			return err("Strategy requires an executor");
		}
		if (!this.feeModel) {
			return err("Strategy requires a fee model");
		}

		const eventDispatcher = this.createEventDispatcher();
		const executor = this.dryRun ? createDryRunExecutor(this.executor, this.clock) : this.executor;

		const deps: StrategyAggregates = {
			position: { positionManager: PositionManager.create() },
			risk: { guardPipeline: this.guards, exitPipeline: this.exits },
			lifecycle: {
				stateMachine: new StrategyStateMachine(this.clock),
				watchdog: new ConnectivityWatchdog(DEFAULT_WATCHDOG_CONFIG, this.clock),
			},
			monitor: {
				eventDispatcher,
				orderRegistry: OrderRegistry.create(this.clock),
			},
			accounting: { feeModel: this.feeModel },
			executor,
			detector: this.detector,
			journal: this.journal,
			clock: this.clock,
			warmupTicks: this.warmupTicks,
			maxSlippageBps: this.config.maxSlippageBps,
		};

		return ok(new BuiltStrategy(deps));
	}

	private snapshot(): StrategyComponents {
		return {
			clock: this.clock,
			executor: this.executor,
			feeModel: this.feeModel,
			journal: this.journal,
			guards: this.guards,
			exits: this.exits,
			detector: this.detector,
			warmupTicks: this.warmupTicks,
			config: this.config,
			dryRun: this.dryRun,
		};
	}

	private createGuardPipeline(): GuardPipeline {
		if (this.guards) {
			return this.guards;
		}
		const maxPositionsGuard = MaxPositionsGuard.create(this.config.maxPositions);
		const lossPct = maxDailyLossUsdcToPct(this.config.maxDailyLossUsdc);
		const killSwitchGuard = KillSwitchGuard.create(lossPct * 0.6, lossPct);
		return GuardPipeline.create().with(maxPositionsGuard).with(killSwitchGuard);
	}

	private createEventDispatcher(): EventDispatcher {
		return createSafeDispatcher(this.clock);
	}

	private createDefaultExecutor(): Executor {
		const error = new ConfigError("No executor configured");
		return {
			submit: async () => err(error),
			cancel: async () => err(error),
		};
	}

	private createDefaultDetector(): SignalDetector {
		return {
			name: "default",
			detectEntry: () => null,
			toOrder: () => {
				throw new ConfigError("No detector configured");
			},
		};
	}
}

/**
 * Creates an EventDispatcher wired with a default error callback that
 * emits `error_occurred` SDK events when handlers throw, with a
 * recursion guard to prevent infinite loops from wildcard handlers.
 *
 * @internal Exported for testing only.
 */
export function createSafeDispatcher(clock: Clock): EventDispatcher {
	let emitting = false;
	const dispatcher = new EventDispatcher((error) => {
		if (emitting) return;
		emitting = true;
		try {
			const detail = error instanceof Error ? error.message : String(error);
			dispatcher.emitSdk({
				type: "error_occurred",
				timestamp: clock.now(),
				code: "HANDLER_THREW",
				message: `Event handler threw during dispatch: ${detail}`,
				category: "non_retryable",
			});
		} finally {
			emitting = false;
		}
	});
	return dispatcher;
}
