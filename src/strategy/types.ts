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

export interface PositionAggregate {
	readonly positionManager: PositionManager;
}

export interface RiskAggregate {
	readonly guardPipeline: GuardPipeline;
	readonly exitPipeline: ExitPipeline;
}

export interface LifecycleAggregate {
	readonly stateMachine: StrategyStateMachine;
	readonly watchdog: ConnectivityWatchdog;
}

export interface MonitorAggregate {
	readonly eventDispatcher: EventDispatcher;
	readonly orderRegistry: OrderRegistry;
}

export interface AccountingAggregate {
	readonly feeModel: FeeModel;
}
