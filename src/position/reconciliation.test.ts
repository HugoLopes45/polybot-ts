import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { conditionId, marketTokenId } from "../shared/identifiers.js";
import { MarketSide } from "../shared/market-side.js";
import {
	type ExchangePosition,
	PositionReconciler,
	type ReconcilerConfig,
} from "./reconciliation.js";
import { SdkPosition } from "./sdk-position.js";

const CID1 = conditionId("0xabc123");
const CID2 = conditionId("0xdef456");
const CID3 = conditionId("0xghi789");
const TOKEN1 = marketTokenId("token1");
const TOKEN2 = marketTokenId("token2");

function createSdkPosition(
	cid: ReturnType<typeof conditionId>,
	tokenId: ReturnType<typeof marketTokenId>,
	size: Decimal,
	side: MarketSide = MarketSide.Yes,
): SdkPosition {
	return SdkPosition.open({
		conditionId: cid,
		tokenId: tokenId,
		side,
		entryPrice: Decimal.from("0.5"),
		size,
		entryTimeMs: Date.now(),
	});
}

function createExchangePosition(
	cid: ReturnType<typeof conditionId>,
	tokenId: ReturnType<typeof marketTokenId>,
	size: Decimal,
	side: MarketSide = MarketSide.Yes,
): ExchangePosition {
	return {
		conditionId: cid,
		tokenId: tokenId,
		side,
		size,
	};
}

describe("PositionReconciler", () => {
	describe("reconcile", () => {
		describe("perfect sync", () => {
			it("should return empty actions when SDK and exchange are in sync", () => {
				const reconciler = new PositionReconciler();
				const sdkPositions = [createSdkPosition(CID1, TOKEN1, Decimal.from("10"))];
				const exchangePositions = [createExchangePosition(CID1, TOKEN1, Decimal.from("10"))];

				const result = reconciler.reconcile(sdkPositions, exchangePositions);

				expect(result.actions).toHaveLength(0);
				expect(result.shouldHalt).toBe(false);
				expect(result.summary).toBe("Sync: 0 orphans, 0 unknowns, 0 mismatches");
			});

			it("should return empty when both are empty", () => {
				const reconciler = new PositionReconciler();
				const result = reconciler.reconcile([], []);

				expect(result.actions).toHaveLength(0);
				expect(result.shouldHalt).toBe(false);
				expect(result.summary).toBe("Sync: 0 orphans, 0 unknowns, 0 mismatches");
			});
		});

		describe("orphan detection", () => {
			it("should detect orphan when position exists in SDK but not in exchange", () => {
				const reconciler = new PositionReconciler();
				const sdkPositions = [createSdkPosition(CID1, TOKEN1, Decimal.from("10"))];
				const exchangePositions: ExchangePosition[] = [];

				const result = reconciler.reconcile(sdkPositions, exchangePositions);

				expect(result.actions).toHaveLength(1);
				expect(result.actions[0]).toEqual({
					type: "orphan",
					conditionId: CID1,
					sdkSize: Decimal.from("10"),
				});
				expect(result.shouldHalt).toBe(false);
			});

			it("should detect multiple orphans", () => {
				const reconciler = new PositionReconciler();
				const sdkPositions = [
					createSdkPosition(CID1, TOKEN1, Decimal.from("10")),
					createSdkPosition(CID2, TOKEN2, Decimal.from("5")),
				];
				const exchangePositions: ExchangePosition[] = [];

				const result = reconciler.reconcile(sdkPositions, exchangePositions);

				expect(result.actions).toHaveLength(2);
				expect(result.actions.every((a) => a.type === "orphan")).toBe(true);
				expect(result.summary).toContain("2 orphans");
			});
		});

		describe("unknown detection", () => {
			it("should detect unknown when position exists in exchange but not in SDK", () => {
				const reconciler = new PositionReconciler();
				const sdkPositions: SdkPosition[] = [];
				const exchangePositions = [createExchangePosition(CID1, TOKEN1, Decimal.from("10"))];

				const result = reconciler.reconcile(sdkPositions, exchangePositions);

				expect(result.actions).toHaveLength(1);
				expect(result.actions[0]).toEqual({
					type: "unknown",
					position: createExchangePosition(CID1, TOKEN1, Decimal.from("10")),
				});
				expect(result.shouldHalt).toBe(false);
			});

			it("should detect multiple unknowns", () => {
				const reconciler = new PositionReconciler();
				const sdkPositions: SdkPosition[] = [];
				const exchangePositions = [
					createExchangePosition(CID1, TOKEN1, Decimal.from("10")),
					createExchangePosition(CID2, TOKEN2, Decimal.from("5")),
				];

				const result = reconciler.reconcile(sdkPositions, exchangePositions);

				expect(result.actions).toHaveLength(2);
				expect(result.actions.every((a) => a.type === "unknown")).toBe(true);
			});
		});

		describe("side mismatch detection", () => {
			it("should treat same conditionId with different sides as separate positions", () => {
				const reconciler = new PositionReconciler();
				const sdkPositions = [createSdkPosition(CID1, TOKEN1, Decimal.from("10"), MarketSide.Yes)];
				const exchangePositions = [
					createExchangePosition(CID1, TOKEN1, Decimal.from("10"), MarketSide.No),
				];

				const result = reconciler.reconcile(sdkPositions, exchangePositions);

				// SDK has YES, exchange has NO — both are unmatched
				expect(result.actions).toHaveLength(2);
				expect(result.actions.some((a) => a.type === "orphan")).toBe(true);
				expect(result.actions.some((a) => a.type === "unknown")).toBe(true);
			});
		});

		describe("size mismatch detection", () => {
			it("should detect size mismatch when sizes differ", () => {
				const reconciler = new PositionReconciler();
				const sdkPositions = [createSdkPosition(CID1, TOKEN1, Decimal.from("10"))];
				const exchangePositions = [createExchangePosition(CID1, TOKEN1, Decimal.from("7"))];

				const result = reconciler.reconcile(sdkPositions, exchangePositions);

				expect(result.actions).toHaveLength(1);
				expect(result.actions[0]).toEqual({
					type: "size_mismatch",
					conditionId: CID1,
					sdkSize: Decimal.from("10"),
					exchangeSize: Decimal.from("7"),
				});
			});
		});

		describe("multiple drifts", () => {
			it("should detect multiple different types of drift", () => {
				const reconciler = new PositionReconciler();
				const sdkPositions = [
					createSdkPosition(CID1, TOKEN1, Decimal.from("10")),
					createSdkPosition(CID2, TOKEN2, Decimal.from("5")),
				];
				const exchangePositions = [
					createExchangePosition(CID1, TOKEN1, Decimal.from("10")),
					createExchangePosition(CID3, TOKEN1, Decimal.from("3")),
				];

				const result = reconciler.reconcile(sdkPositions, exchangePositions);

				expect(result.actions).toHaveLength(2);
				expect(result.actions[0].type).toBe("orphan");
				expect(result.actions[1].type).toBe("unknown");
			});
		});

		describe("SDK empty, exchange has positions", () => {
			it("should detect all exchange positions as unknowns", () => {
				const reconciler = new PositionReconciler();
				const sdkPositions: SdkPosition[] = [];
				const exchangePositions = [
					createExchangePosition(CID1, TOKEN1, Decimal.from("10")),
					createExchangePosition(CID2, TOKEN2, Decimal.from("20")),
				];

				const result = reconciler.reconcile(sdkPositions, exchangePositions);

				expect(result.actions).toHaveLength(2);
				expect(result.actions.every((a) => a.type === "unknown")).toBe(true);
			});
		});

		describe("exchange empty, SDK has positions", () => {
			it("should detect all SDK positions as orphans", () => {
				const reconciler = new PositionReconciler();
				const sdkPositions = [
					createSdkPosition(CID1, TOKEN1, Decimal.from("10")),
					createSdkPosition(CID2, TOKEN2, Decimal.from("20")),
				];
				const exchangePositions: ExchangePosition[] = [];

				const result = reconciler.reconcile(sdkPositions, exchangePositions);

				expect(result.actions).toHaveLength(2);
				expect(result.actions.every((a) => a.type === "orphan")).toBe(true);
			});
		});

		describe("halt threshold", () => {
			it("should halt when unknown count exceeds threshold", () => {
				const reconciler = new PositionReconciler({ haltThreshold: 3 });
				const sdkPositions: SdkPosition[] = [];
				const cid4 = conditionId("0xxyz000");
				const token4 = marketTokenId("token4");
				const exchangePositions = [
					createExchangePosition(CID1, TOKEN1, Decimal.from("1")),
					createExchangePosition(CID2, TOKEN2, Decimal.from("2")),
					createExchangePosition(CID3, TOKEN1, Decimal.from("3")),
					createExchangePosition(cid4, token4, Decimal.from("4")),
				];

				const result = reconciler.reconcile(sdkPositions, exchangePositions);

				expect(result.shouldHalt).toBe(true);
			});

			it("should not halt when unknown count equals threshold", () => {
				const reconciler = new PositionReconciler({ haltThreshold: 3 });
				const sdkPositions: SdkPosition[] = [];
				const exchangePositions = [
					createExchangePosition(CID1, TOKEN1, Decimal.from("1")),
					createExchangePosition(CID2, TOKEN2, Decimal.from("2")),
				];

				const result = reconciler.reconcile(sdkPositions, exchangePositions);

				expect(result.shouldHalt).toBe(false);
			});

			it("should not halt when unknowns are below threshold", () => {
				const reconciler = new PositionReconciler({ haltThreshold: 2 });
				const sdkPositions: SdkPosition[] = [];
				const exchangePositions = [createExchangePosition(CID1, TOKEN1, Decimal.from("1"))];

				const result = reconciler.reconcile(sdkPositions, exchangePositions);

				expect(result.shouldHalt).toBe(false);
			});

			it("should use default threshold of 3", () => {
				const reconciler = new PositionReconciler();
				const sdkPositions: SdkPosition[] = [];
				const exchangePositions = [
					createExchangePosition(CID1, TOKEN1, Decimal.from("1")),
					createExchangePosition(CID2, TOKEN2, Decimal.from("2")),
					createExchangePosition(CID3, TOKEN1, Decimal.from("3")),
				];

				const result = reconciler.reconcile(sdkPositions, exchangePositions);

				expect(result.shouldHalt).toBe(false);
			});

			it("should support custom halt threshold", () => {
				const reconciler = new PositionReconciler({ haltThreshold: 1 });
				const sdkPositions: SdkPosition[] = [];
				const cid2 = conditionId("0xxyz000");
				const token2 = marketTokenId("token2");
				const exchangePositions = [
					createExchangePosition(CID1, TOKEN1, Decimal.from("1")),
					createExchangePosition(cid2, token2, Decimal.from("2")),
				];

				const result = reconciler.reconcile(sdkPositions, exchangePositions);

				expect(result.shouldHalt).toBe(true);
			});
		});

		describe("orphans don't count for halt", () => {
			it("should not halt when only orphans detected", () => {
				const reconciler = new PositionReconciler({ haltThreshold: 1 });
				const sdkPositions = [createSdkPosition(CID1, TOKEN1, Decimal.from("10"))];
				const exchangePositions: ExchangePosition[] = [];

				const result = reconciler.reconcile(sdkPositions, exchangePositions);

				expect(result.shouldHalt).toBe(false);
			});
		});

		describe("size mismatch doesn't trigger halt", () => {
			it("should not halt on size mismatch alone", () => {
				const reconciler = new PositionReconciler({ haltThreshold: 1 });
				const sdkPositions = [createSdkPosition(CID1, TOKEN1, Decimal.from("10"))];
				const exchangePositions = [createExchangePosition(CID1, TOKEN1, Decimal.from("5"))];

				const result = reconciler.reconcile(sdkPositions, exchangePositions);

				expect(result.shouldHalt).toBe(false);
			});
		});

		describe("summary string format", () => {
			it("should format summary with all counts", () => {
				const reconciler = new PositionReconciler();
				const sdkPositions = [createSdkPosition(CID1, TOKEN1, Decimal.from("10"))];
				const exchangePositions = [
					createExchangePosition(CID1, TOKEN1, Decimal.from("5")),
					createExchangePosition(CID2, TOKEN2, Decimal.from("3")),
				];

				const result = reconciler.reconcile(sdkPositions, exchangePositions);

				expect(result.summary).toContain("orphans");
				expect(result.summary).toContain("unknowns");
				expect(result.summary).toContain("mismatches");
			});
		});
	});

	describe("default config", () => {
		it("should use default threshold of 3", () => {
			const reconciler = new PositionReconciler();
			const config = (reconciler as unknown as { config: ReconcilerConfig }).config;
			expect(config.haltThreshold).toBe(3);
		});
	});
});
