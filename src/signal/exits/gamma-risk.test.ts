import { describe, expect, it } from "vitest";
import { Decimal } from "../../shared/decimal.js";
import type { DetectorContextLike, PositionLike } from "../types.js";
import { GammaRiskExit } from "./gamma-risk.js";

function mockPosition(): PositionLike {
	return {
		conditionId: "test-condition",
		tokenId: "test-token",
		side: "yes",
		entryPrice: Decimal.from(0.5),
		size: Decimal.from(100),
		highWaterMark: Decimal.from(0.5),
		entryTimeMs: 1000,
		pnlTotal: () => Decimal.zero(),
		drawdown: () => Decimal.zero(),
	};
}

function mockContext(spot: number, timeRemainingMs: number): DetectorContextLike {
	return {
		conditionId: "test-condition",
		nowMs: () => 1000,
		spot: () => Decimal.from(spot),
		oraclePrice: () => null,
		timeRemainingMs: () => timeRemainingMs,
		bestBid: () => null,
		bestAsk: () => null,
		spread: () => null,
	};
}

describe("GammaRiskExit", () => {
	describe("near expiry + spot near 0.5", () => {
		it("exits when spot is 0.5 and time remaining is low", () => {
			const exit = GammaRiskExit.create({ minTimeRemainingMs: 300_000 });
			const position = mockPosition();
			const ctx = mockContext(0.5, 200_000);

			const reason = exit.shouldExit(position, ctx);

			expect(reason).not.toBeNull();
			expect(reason?.type).toBe("emergency");
			if (reason?.type === "emergency") {
				expect(reason.reason).toContain("gamma risk");
			}
		});

		it("exits when spot is 0.4 (within range) and time is low", () => {
			const exit = GammaRiskExit.create({ minTimeRemainingMs: 300_000 });
			const position = mockPosition();
			const ctx = mockContext(0.4, 200_000);

			const reason = exit.shouldExit(position, ctx);

			expect(reason).not.toBeNull();
			expect(reason?.type).toBe("emergency");
		});

		it("exits when spot is 0.6 (within range) and time is low", () => {
			const exit = GammaRiskExit.create({ minTimeRemainingMs: 300_000 });
			const position = mockPosition();
			const ctx = mockContext(0.6, 200_000);

			const reason = exit.shouldExit(position, ctx);

			expect(reason).not.toBeNull();
			expect(reason?.type).toBe("emergency");
		});
	});

	describe("spot at extremes", () => {
		it("does not exit when spot is 0.2 (below range)", () => {
			const exit = GammaRiskExit.create({ minTimeRemainingMs: 300_000 });
			const position = mockPosition();
			const ctx = mockContext(0.2, 200_000);

			const reason = exit.shouldExit(position, ctx);

			expect(reason).toBeNull();
		});

		it("does not exit when spot is 0.8 (above range)", () => {
			const exit = GammaRiskExit.create({ minTimeRemainingMs: 300_000 });
			const position = mockPosition();
			const ctx = mockContext(0.8, 200_000);

			const reason = exit.shouldExit(position, ctx);

			expect(reason).toBeNull();
		});

		it("does not exit when spot is 0.29 (boundary)", () => {
			const exit = GammaRiskExit.create({ minTimeRemainingMs: 300_000 });
			const position = mockPosition();
			const ctx = mockContext(0.29, 200_000);

			const reason = exit.shouldExit(position, ctx);

			expect(reason).toBeNull();
		});

		it("does not exit when spot is 0.71 (boundary)", () => {
			const exit = GammaRiskExit.create({ minTimeRemainingMs: 300_000 });
			const position = mockPosition();
			const ctx = mockContext(0.71, 200_000);

			const reason = exit.shouldExit(position, ctx);

			expect(reason).toBeNull();
		});
	});

	describe("time remaining", () => {
		it("does not exit when time remaining is sufficient", () => {
			const exit = GammaRiskExit.create({ minTimeRemainingMs: 300_000 });
			const position = mockPosition();
			const ctx = mockContext(0.5, 400_000);

			const reason = exit.shouldExit(position, ctx);

			expect(reason).toBeNull();
		});

		it("uses default 5 minutes when not specified", () => {
			const exit = GammaRiskExit.create();
			const position = mockPosition();
			const ctx = mockContext(0.5, 200_000);

			const reason = exit.shouldExit(position, ctx);

			expect(reason).not.toBeNull();
		});
	});

	describe("null spot", () => {
		it("exits with emergency when spot is null and near expiry", () => {
			const exit = GammaRiskExit.create({ minTimeRemainingMs: 300_000 });
			const position = mockPosition();
			const ctx = {
				...mockContext(0.5, 200_000),
				spot: () => null,
			};

			const reason = exit.shouldExit(position, ctx);

			expect(reason).not.toBeNull();
			expect(reason?.type).toBe("emergency");
			if (reason?.type === "emergency") {
				expect(reason.reason).toContain("no spot data near expiry");
			}
		});

		it("does not exit when spot is null but far from expiry", () => {
			const exit = GammaRiskExit.create({ minTimeRemainingMs: 300_000 });
			const position = mockPosition();
			const ctx = {
				...mockContext(0.5, 400_000),
				spot: () => null,
			};

			const reason = exit.shouldExit(position, ctx);

			expect(reason).toBeNull();
		});
	});
});
