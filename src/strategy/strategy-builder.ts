import { fixedNotionalFee } from "../accounting/fee-model.js";
import type { FeeModel } from "../accounting/fee-model.js";
import { EventDispatcher } from "../events/event-dispatcher.js";
import type { Executor } from "../execution/types.js";
import { StrategyStateMachine } from "../lifecycle/state-machine.js";
import { ConnectivityWatchdog, DEFAULT_WATCHDOG_CONFIG } from "../lifecycle/watchdog.js";
import { OrderRegistry } from "../order/order-registry.js";
import { PositionManager } from "../position/position-manager.js";
import { GuardPipeline } from "../risk/guard-pipeline.js";
import { ConfigError } from "../shared/errors.js";
import { type Result, err, ok } from "../shared/result.js";
import type { Clock } from "../shared/time.js";
import { SystemClock } from "../shared/time.js";
import { ExitPipeline } from "../signal/exit-pipeline.js";
import type { SignalDetector } from "../signal/types.js";
import { BuiltStrategy } from "./built-strategy.js";
import type { BuiltStrategyDeps } from "./built-strategy.js";
import type { Journal } from "./journal.js";
import type {
	AccountingAggregate,
	LifecycleAggregate,
	MonitorAggregate,
	PositionAggregate,
	RiskAggregate,
} from "./types.js";

export interface StrategyBuilderDeps {
	clock?: Clock | undefined;
	executor?: Executor | undefined;
	feeModel?: FeeModel | undefined;
	journal?: Journal | null | undefined;
	guards?: GuardPipeline | undefined;
	exits?: ExitPipeline | undefined;
	detector?: SignalDetector | undefined;
}

export class StrategyBuilder {
	private readonly clock: Clock;
	private readonly executor: Executor | undefined;
	private readonly feeModel: FeeModel | undefined;
	private readonly journal: Journal | null;
	private readonly guards: GuardPipeline | undefined;
	private readonly exits: ExitPipeline | undefined;
	private readonly detector: SignalDetector | undefined;

	constructor(deps: StrategyBuilderDeps = {}) {
		this.clock = deps.clock ?? SystemClock;
		this.executor = deps.executor;
		this.feeModel = deps.feeModel;
		this.journal = deps.journal ?? null;
		this.guards = deps.guards;
		this.exits = deps.exits;
		this.detector = deps.detector;
	}

	static create(deps?: StrategyBuilderDeps): StrategyBuilder {
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

	build(): BuiltStrategy {
		const positionAggregate: PositionAggregate = {
			positionManager: PositionManager.create(),
		};

		const riskAggregate: RiskAggregate = {
			guardPipeline: this.guards ?? GuardPipeline.create(),
			exitPipeline: this.exits ?? ExitPipeline.create(),
		};

		const lifecycleAggregate: LifecycleAggregate = {
			stateMachine: new StrategyStateMachine(this.clock),
			watchdog: new ConnectivityWatchdog(DEFAULT_WATCHDOG_CONFIG, this.clock),
		};

		const monitorAggregate: MonitorAggregate = {
			eventDispatcher: new EventDispatcher(),
			orderRegistry: OrderRegistry.create(this.clock),
		};

		const accountingAggregate: AccountingAggregate = {
			feeModel: this.feeModel ?? fixedNotionalFee(0),
		};

		const deps: BuiltStrategyDeps = {
			position: positionAggregate,
			risk: riskAggregate,
			lifecycle: lifecycleAggregate,
			monitor: monitorAggregate,
			accounting: accountingAggregate,
			executor: this.executor ?? this.createDefaultExecutor(),
			detector: this.detector ?? this.createDefaultDetector(),
			journal: this.journal,
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

		const deps: BuiltStrategyDeps = {
			position: { positionManager: PositionManager.create() },
			risk: { guardPipeline: this.guards, exitPipeline: this.exits },
			lifecycle: {
				stateMachine: new StrategyStateMachine(this.clock),
				watchdog: new ConnectivityWatchdog(DEFAULT_WATCHDOG_CONFIG, this.clock),
			},
			monitor: {
				eventDispatcher: new EventDispatcher(),
				orderRegistry: OrderRegistry.create(this.clock),
			},
			accounting: { feeModel: this.feeModel },
			executor: this.executor,
			detector: this.detector,
			journal: this.journal,
		};

		return ok(new BuiltStrategy(deps));
	}

	private snapshot(): StrategyBuilderDeps {
		return {
			clock: this.clock,
			executor: this.executor,
			feeModel: this.feeModel,
			journal: this.journal,
			guards: this.guards,
			exits: this.exits,
			detector: this.detector,
		};
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
