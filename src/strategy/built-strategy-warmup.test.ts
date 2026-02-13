import { beforeEach, describe, expect, it } from "vitest";
import {
	BuiltStrategy,
	Decimal,
	EventDispatcher,
	OrderRegistry,
	PositionManager,
	StrategyStateMachine,
	SystemClock,
	createMockContext,
	createMockDetector,
	createMockExecutor,
	createMockExitPipeline,
	createMockFeeModel,
	createMockGuardPipeline,
	createMockWatchdog,
	openPosition,
} from "./built-strategy-test-helpers.js";

describe("BuiltStrategy — warmup", () => {
	let eventDispatcher: EventDispatcher;
	let capturedEvents: Map<string, unknown[]>;

	beforeEach(() => {
		eventDispatcher = new EventDispatcher();
		capturedEvents = new Map();
		eventDispatcher.onSdk("*", (event) => {
			const list = capturedEvents.get(event.type) ?? [];
			list.push(event);
			capturedEvents.set(event.type, list);
		});
	});

	function sdkEvents(type: string): unknown[] {
		return capturedEvents.get(type) ?? [];
	}

	function createRealStateMachine(): StrategyStateMachine {
		return new StrategyStateMachine();
	}

	function buildWithWarmup(warmupTicks: number): BuiltStrategy {
		const stateMachine = createRealStateMachine();
		return new BuiltStrategy({
			position: { positionManager: PositionManager.create() },
			risk: {
				guardPipeline: createMockGuardPipeline({ type: "allow" }),
				exitPipeline: createMockExitPipeline(null),
			},
			lifecycle: {
				stateMachine,
				watchdog: createMockWatchdog(),
			},
			monitor: { eventDispatcher, orderRegistry: OrderRegistry.create(SystemClock) },
			accounting: { feeModel: createMockFeeModel() },
			executor: createMockExecutor(),
			detector: createMockDetector({ edge: 0.1, confidence: 0.8 }),
			journal: null,
			warmupTicks,
		});
	}

	it("should be immediately active when warmupTicks is undefined", async () => {
		const strategy = new BuiltStrategy({
			position: { positionManager: PositionManager.create() },
			risk: {
				guardPipeline: createMockGuardPipeline({ type: "allow" }),
				exitPipeline: createMockExitPipeline(null),
			},
			lifecycle: {
				stateMachine: createRealStateMachine(),
				watchdog: createMockWatchdog(),
			},
			monitor: { eventDispatcher, orderRegistry: OrderRegistry.create(SystemClock) },
			accounting: { feeModel: createMockFeeModel() },
			executor: createMockExecutor(),
			detector: createMockDetector({ edge: 0.1, confidence: 0.8 }),
			journal: null,
		});

		await strategy.tick(createMockContext());
		expect(sdkEvents("position_opened")).toHaveLength(1);
	});

	it("should be immediately active when warmupTicks is 0", async () => {
		const strategy = buildWithWarmup(0);
		await strategy.tick(createMockContext());
		expect(sdkEvents("position_opened")).toHaveLength(1);
	});

	it("should block entries during warmup", async () => {
		const strategy = buildWithWarmup(3);
		await strategy.tick(createMockContext());
		expect(sdkEvents("position_opened")).toHaveLength(0);
	});

	it("should emit state_changed when transitioning to WarmingUp", async () => {
		const strategy = buildWithWarmup(3);
		await strategy.tick(createMockContext());

		const stateChanges = sdkEvents("state_changed");
		expect(stateChanges).toHaveLength(1);
		const event = stateChanges[0] as { from: string; to: string; transition: string };
		expect(event.from).toBe("initializing");
		expect(event.to).toBe("warming_up");
		expect(event.transition).toBe("initialize");
	});

	it("should emit progress events during warmup (update_warmup transition)", async () => {
		const strategy = buildWithWarmup(3);
		await strategy.tick(createMockContext());

		const stateChanges = sdkEvents("state_changed");
		expect(stateChanges).toHaveLength(1);
		const event = stateChanges[0] as { from: string; to: string };
		expect(event.from).toBe("initializing");
		expect(event.to).toBe("warming_up");
	});

	it("should complete warmup after N ticks and allow entries", async () => {
		const strategy = buildWithWarmup(3);

		await strategy.tick(createMockContext());
		expect(sdkEvents("position_opened")).toHaveLength(0);

		await strategy.tick(createMockContext());
		expect(sdkEvents("position_opened")).toHaveLength(0);

		await strategy.tick(createMockContext());
		expect(sdkEvents("position_opened")).toHaveLength(1);

		const stateChanges = sdkEvents("state_changed");
		const lastEvent = stateChanges[stateChanges.length - 1] as {
			from: string;
			to: string;
			transition: string;
		};
		expect(lastEvent.from).toBe("warming_up");
		expect(lastEvent.to).toBe("active");
		expect(lastEvent.transition).toBe("warmup_complete");
	});

	it("should touch watchdog during warmup ticks", async () => {
		const watchdog = createMockWatchdog();
		const stateMachine = createRealStateMachine();

		const strategy = new BuiltStrategy({
			position: { positionManager: PositionManager.create() },
			risk: {
				guardPipeline: createMockGuardPipeline({ type: "allow" }),
				exitPipeline: createMockExitPipeline(null),
			},
			lifecycle: { stateMachine, watchdog },
			monitor: { eventDispatcher, orderRegistry: OrderRegistry.create(SystemClock) },
			accounting: { feeModel: createMockFeeModel() },
			executor: createMockExecutor(),
			detector: createMockDetector({ edge: 0.1, confidence: 0.8 }),
			journal: null,
			warmupTicks: 2,
		});

		await strategy.tick(createMockContext());
		expect(watchdog.touch).toHaveBeenCalledTimes(1);

		await strategy.tick(createMockContext());
		expect(watchdog.touch).toHaveBeenCalledTimes(2);
	});

	it("should not allow entries during warmup regardless of guard verdict", async () => {
		const strategy = buildWithWarmup(3);

		await strategy.tick(createMockContext());
		await strategy.tick(createMockContext());

		expect(sdkEvents("position_opened")).toHaveLength(0);
	});

	it("should block exits during warmup (canClose returns false in WarmingUp state)", async () => {
		const pm = openPosition(PositionManager.create());

		const strategy = new BuiltStrategy({
			position: { positionManager: pm },
			risk: {
				guardPipeline: createMockGuardPipeline({ type: "allow" }),
				exitPipeline: createMockExitPipeline({ type: "take_profit", roi: Decimal.from(0.2) }),
			},
			lifecycle: { stateMachine: createRealStateMachine(), watchdog: createMockWatchdog() },
			monitor: { eventDispatcher, orderRegistry: OrderRegistry.create(SystemClock) },
			accounting: { feeModel: createMockFeeModel() },
			executor: createMockExecutor(),
			detector: createMockDetector(null),
			journal: null,
			warmupTicks: 3,
		});

		await strategy.tick(createMockContext());
		expect(sdkEvents("position_closed")).toHaveLength(0);
	});

	it("should not open positions during warmup even with favorable guards", async () => {
		const strategy = buildWithWarmup(3);

		await strategy.tick(createMockContext());
		await strategy.tick(createMockContext());

		expect(sdkEvents("position_opened")).toHaveLength(0);
	});

	it("should handle warmupTicks of 1 correctly", async () => {
		const strategy = buildWithWarmup(1);

		await strategy.tick(createMockContext());

		expect(sdkEvents("position_opened")).toHaveLength(1);
		const stateChanges = sdkEvents("state_changed");
		expect(stateChanges).toHaveLength(2);
		const initEvent = stateChanges[0] as { from: string; to: string };
		expect(initEvent.from).toBe("initializing");
		expect(initEvent.to).toBe("warming_up");
		const completeEvent = stateChanges[1] as { from: string; to: string };
		expect(completeEvent.from).toBe("warming_up");
		expect(completeEvent.to).toBe("active");
	});
});
