import { describe, expect, it } from "vitest";
import { Decimal } from "../../shared/decimal.js";
import type { DetectorContextLike, PositionLike } from "../types.js";
import { MaxHoldTimeExit } from "./max-hold-time.js";

function mockPosition(entryTimeMs: number): PositionLike {
	return {
		conditionId: "test-condition",
		tokenId: "test-token",
		side: "yes",
		entryPrice: Decimal.from(0.5),
		size: Decimal.from(100),
		highWaterMark: Decimal.from(0.5),
		entryTimeMs,
		pnlTotal: () => Decimal.zero(),
		drawdown: () => Decimal.zero(),
	};
}

function mockContext(nowMs: number): DetectorContextLike {
	return {
		conditionId: "test-condition",
		nowMs: () => nowMs,
		spot: () => null,
		oraclePrice: () => null,
		timeRemainingMs: () => 0,
		bestBid: () => null,
		bestAsk: () => null,
		spread: () => null,
	};
}

describe("MaxHoldTimeExit", () => {
	it("exits when position held longer than max duration", () => {
		const entryTimeMs = 1000;
		const maxHoldMs = 60_000;
		const nowMs = entryTimeMs + 70_000;

		const exit = MaxHoldTimeExit.create(maxHoldMs);
		const position = mockPosition(entryTimeMs);
		const ctx = mockContext(nowMs);

		const reason = exit.shouldExit(position, ctx);

		expect(reason).not.toBeNull();
		expect(reason?.type).toBe("time_exit");
		if (reason?.type === "time_exit") {
			expect(reason.remainingSecs).toBe(0);
		}
	});

	it("does not exit when position held less than max duration", () => {
		const entryTimeMs = 1000;
		const maxHoldMs = 60_000;
		const nowMs = entryTimeMs + 50_000;

		const exit = MaxHoldTimeExit.create(maxHoldMs);
		const position = mockPosition(entryTimeMs);
		const ctx = mockContext(nowMs);

		const reason = exit.shouldExit(position, ctx);

		expect(reason).toBeNull();
	});

	it("exits at exact boundary", () => {
		const entryTimeMs = 1000;
		const maxHoldMs = 60_000;
		const nowMs = entryTimeMs + 60_001;

		const exit = MaxHoldTimeExit.create(maxHoldMs);
		const position = mockPosition(entryTimeMs);
		const ctx = mockContext(nowMs);

		const reason = exit.shouldExit(position, ctx);

		expect(reason).not.toBeNull();
		expect(reason?.type).toBe("time_exit");
	});

	it("does not exit one millisecond before boundary", () => {
		const entryTimeMs = 1000;
		const maxHoldMs = 60_000;
		const nowMs = entryTimeMs + 60_000;

		const exit = MaxHoldTimeExit.create(maxHoldMs);
		const position = mockPosition(entryTimeMs);
		const ctx = mockContext(nowMs);

		const reason = exit.shouldExit(position, ctx);

		expect(reason).toBeNull();
	});
});
