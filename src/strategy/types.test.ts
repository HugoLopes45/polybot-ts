import { describe, expect, it } from "vitest";
import { noFees } from "../accounting/fee-model.js";
import { EventDispatcher } from "../events/event-dispatcher.js";
import { StrategyStateMachine } from "../lifecycle/state-machine.js";
import { ConnectivityWatchdog } from "../lifecycle/watchdog.js";
import { OrderRegistry } from "../order/order-registry.js";
import { PositionManager } from "../position/position-manager.js";
import { GuardPipeline } from "../risk/guard-pipeline.js";
import { ExitPipeline } from "../signal/exit-pipeline.js";
import type {
	AccountingAggregate,
	LifecycleAggregate,
	MonitorAggregate,
	PositionAggregate,
	RiskAggregate,
} from "./types.js";

describe("Strategy sub-aggregates", () => {
	it("PositionAggregate composes PositionManager", () => {
		const agg: PositionAggregate = { positionManager: PositionManager.create() };
		expect(agg.positionManager.openCount()).toBe(0);
	});

	it("RiskAggregate composes GuardPipeline and ExitPipeline", () => {
		const agg: RiskAggregate = {
			guardPipeline: GuardPipeline.standard(),
			exitPipeline: ExitPipeline.standard(),
		};
		expect(agg.guardPipeline.len()).toBeGreaterThan(0);
		expect(agg.exitPipeline.len()).toBeGreaterThan(0);
	});

	it("LifecycleAggregate composes StateMachine and Watchdog", () => {
		const agg: LifecycleAggregate = {
			stateMachine: new StrategyStateMachine(),
			watchdog: new ConnectivityWatchdog(),
		};
		expect(agg.stateMachine.state()).toBeDefined();
		expect(agg.watchdog.status()).toBeDefined();
	});

	it("MonitorAggregate composes EventDispatcher and OrderRegistry", () => {
		const agg: MonitorAggregate = {
			eventDispatcher: new EventDispatcher(),
			orderRegistry: OrderRegistry.create(),
		};
		expect(agg.orderRegistry.activeCount()).toBe(0);
	});

	it("AccountingAggregate composes FeeModel", () => {
		const agg: AccountingAggregate = { feeModel: noFees() };
		expect(agg.feeModel.type).toBe("none");
	});
});
