import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventDispatcher } from "../../events/event-dispatcher.js";
import type { SdkPosition } from "../../position/sdk-position.js";
import { Decimal } from "../../shared/decimal.js";
import { conditionId, marketTokenId } from "../../shared/identifiers.js";
import { MarketSide } from "../../shared/market-side.js";
import type { DetectorContextLike } from "../../signal/types.js";
import { TestRunner } from "./test-runner.js";

const mockContext: DetectorContextLike = {
	conditionId: conditionId("test"),
	nowMs: () => Date.now(),
	spot: () => Decimal.from(0.5),
	oraclePrice: () => Decimal.from(0.5),
	timeRemainingMs: () => 60000,
	bestBid: () => Decimal.from(0.49),
	bestAsk: () => Decimal.from(0.51),
	spread: () => Decimal.from(0.02),
};

describe("TestRunner", () => {
	let runner: TestRunner;

	beforeEach(() => {
		runner = new TestRunner();
	});

	describe("withContext", () => {
		it("should set context for the runner", () => {
			runner.withContext(mockContext);

			expect(runner.context).toBe(mockContext);
		});

		it("should return this for chaining", () => {
			const result = runner.withContext(mockContext);

			expect(result).toBe(runner);
		});
	});

	describe("tick", () => {
		it("should execute tick on the strategy", async () => {
			const tickFn = vi.fn().mockResolvedValue(undefined);
			runner.withContext(mockContext);
			await runner.tick(tickFn);

			expect(tickFn).toHaveBeenCalledWith(mockContext);
		});

		it("should return this for chaining", async () => {
			const tickFn = vi.fn().mockResolvedValue(undefined);
			runner.withContext(mockContext);
			const result = await runner.tick(tickFn);

			expect(result).toBe(runner);
		});

		it("should throw when context not set", async () => {
			await expect(runner.tick(async () => {})).rejects.toThrow("Context not set");
		});
	});

	describe("tickN", () => {
		it("should execute tick N times", async () => {
			const tickFn = vi.fn().mockResolvedValue(undefined);
			runner.withContext(mockContext);
			await runner.tickN(tickFn, 3);

			expect(tickFn).toHaveBeenCalledTimes(3);
		});

		it("should pass context to each tick", async () => {
			const tickFn = vi.fn().mockResolvedValue(undefined);
			runner.withContext(mockContext);
			await runner.tickN(tickFn, 2);

			expect(tickFn).toHaveBeenCalledWith(mockContext);
			expect(tickFn).toHaveBeenCalledWith(mockContext);
		});
	});

	describe("events (with EventDispatcher)", () => {
		it("should capture SDK events from EventDispatcher", async () => {
			const dispatcher = new EventDispatcher();
			const runnerWithEvents = new TestRunner({ eventDispatcher: dispatcher });
			runnerWithEvents.withContext(mockContext);

			await runnerWithEvents.tick(async () => {
				dispatcher.emitSdk({
					type: "order_placed",
					timestamp: Date.now(),
					clientOrderId: "test" as never,
					conditionId: conditionId("test"),
					tokenId: marketTokenId("YES", "m"),
					side: MarketSide.Yes,
					price: 0.5,
					size: 10,
				});
			});

			expect(runnerWithEvents.events()).toHaveLength(1);
			expect(runnerWithEvents.events()[0]?.type).toBe("order_placed");
		});

		it("should return empty events without EventDispatcher", async () => {
			runner.withContext(mockContext);
			await runner.tick(async () => {});

			expect(runner.events()).toHaveLength(0);
		});
	});

	describe("eventsOfType", () => {
		it("should filter events by type", async () => {
			const dispatcher = new EventDispatcher();
			const runnerWithEvents = new TestRunner({ eventDispatcher: dispatcher });
			runnerWithEvents.withContext(mockContext);

			await runnerWithEvents.tick(async () => {
				dispatcher.emitSdk({
					type: "order_placed",
					timestamp: Date.now(),
					clientOrderId: "test" as never,
					conditionId: conditionId("test"),
					tokenId: marketTokenId("YES", "m"),
					side: MarketSide.Yes,
					price: 0.5,
					size: 10,
				});
				dispatcher.emitSdk({
					type: "guard_blocked",
					timestamp: Date.now(),
					guardName: "test",
					reason: "test",
					recoverable: true,
				});
			});

			expect(runnerWithEvents.eventsOfType("order_placed")).toHaveLength(1);
			expect(runnerWithEvents.eventsOfType("guard_blocked")).toHaveLength(1);
			expect(runnerWithEvents.eventsOfType("position_opened")).toHaveLength(0);
		});
	});

	describe("positions", () => {
		it("should return empty without getPositions callback", () => {
			expect(runner.positions()).toHaveLength(0);
		});

		it("should delegate to getPositions callback", () => {
			const fakePosition = { conditionId: conditionId("test") } as SdkPosition;
			const runnerWithPositions = new TestRunner({
				getPositions: () => [fakePosition],
			});

			expect(runnerWithPositions.positions()).toHaveLength(1);
			expect(runnerWithPositions.positions()[0]?.conditionId).toBe(fakePosition.conditionId);
		});
	});

	describe("assertNoTrades", () => {
		it("should pass when no orders were placed", async () => {
			runner.withContext(mockContext);
			await runner.tick(async () => {});

			expect(() => runner.assertNoTrades()).not.toThrow();
		});

		it("should throw when orders were placed", async () => {
			const dispatcher = new EventDispatcher();
			const runnerWithEvents = new TestRunner({ eventDispatcher: dispatcher });
			runnerWithEvents.withContext(mockContext);

			await runnerWithEvents.tick(async () => {
				dispatcher.emitSdk({
					type: "order_placed",
					timestamp: Date.now(),
					clientOrderId: "test" as never,
					conditionId: conditionId("test"),
					tokenId: marketTokenId("YES", "m"),
					side: MarketSide.Yes,
					price: 0.5,
					size: 10,
				});
			});

			expect(() => runnerWithEvents.assertNoTrades()).toThrow("Expected no trades but found 1");
		});
	});

	describe("assertTradeCount", () => {
		it("should pass when trade count matches", async () => {
			runner.withContext(mockContext);
			await runner.tick(async () => {});

			expect(() => runner.assertTradeCount(0)).not.toThrow();
		});

		it("should throw when trade count does not match", async () => {
			runner.withContext(mockContext);
			await runner.tick(async () => {});

			expect(() => runner.assertTradeCount(1)).toThrow();
		});
	});
});
