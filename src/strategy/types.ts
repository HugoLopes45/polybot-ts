/**
 * Strategy sub-aggregates — mirrors Rust's BuiltStrategy decomposition.
 *
 * Each aggregate owns a specific concern: positions, risk, lifecycle,
 * monitoring, and accounting. The BuiltStrategy composes all five.
 */

import type { FeeModel } from "../accounting/fee-model.js";
import type { EventDispatcher } from "../events/event-dispatcher.js";
import type { StrategyStateMachine } from "../lifecycle/state-machine.js";
import type { ConnectivityWatchdog } from "../lifecycle/watchdog.js";
import type { OrderRegistry } from "../order/order-registry.js";
import type { PositionManager } from "../position/position-manager.js";
import type { GuardPipeline } from "../risk/guard-pipeline.js";
import type { ExitPipeline } from "../signal/exit-pipeline.js";

/** Aggregate owning position lifecycle and tracking. */
export interface PositionAggregate {
	readonly positionManager: PositionManager;
}

/** Aggregate owning guard pipeline and exit pipeline. */
export interface RiskAggregate {
	readonly guardPipeline: GuardPipeline;
	readonly exitPipeline: ExitPipeline;
}

/** Aggregate owning the state machine and connectivity watchdog. */
export interface LifecycleAggregate {
	readonly stateMachine: StrategyStateMachine;
	readonly watchdog: ConnectivityWatchdog;
}

/** Aggregate owning event dispatch and order tracking. */
export interface MonitorAggregate {
	readonly eventDispatcher: EventDispatcher;
	readonly orderRegistry: OrderRegistry;
}

/** Aggregate owning the fee computation model. */
export interface AccountingAggregate {
	readonly feeModel: FeeModel;
}
