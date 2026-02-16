import { describe, expect, it } from "vitest";
import { Decimal } from "../../shared/decimal.js";
import { conditionId, marketTokenId } from "../../shared/identifiers.js";
import { MarketSide } from "../../shared/market-side.js";
import type { DetectorContextLike } from "../types.js";
import { OracleArbDetector } from "./oracle-arb-detector.js";

function makeCtx(spot: number): DetectorContextLike {
	return {
		conditionId: conditionId("test-condition"),
		nowMs: () => 1000,
		spot: () => Decimal.from(spot),
		oraclePrice: () => null,
		timeRemainingMs: () => 3600_000,
		bestBid: () => Decimal.from(spot - 0.01),
		bestAsk: () => Decimal.from(spot + 0.01),
		spread: () => Decimal.from(0.02),
	};
}

describe("OracleArbDetector", () => {
	const config = {
		minDivergencePct: Decimal.from("0.02"),
		orderSize: Decimal.from("100"),
		side: MarketSide.Yes,
		tokenId: marketTokenId("test-yes-token"),
	};

	it("returns null when oracle price is null", () => {
		const detector = OracleArbDetector.create(config, () => null);
		expect(detector.detectEntry(makeCtx(0.5))).toBeNull();
	});

	it("returns null when spot is null", () => {
		const detector = OracleArbDetector.create(config, () => Decimal.from("0.55"));
		const ctx: DetectorContextLike = {
			...makeCtx(0.5),
			spot: () => null,
		};
		expect(detector.detectEntry(ctx)).toBeNull();
	});

	it("returns null when divergence below threshold", () => {
		// 1% divergence < 2% threshold
		const detector = OracleArbDetector.create(config, () => Decimal.from("0.505"));
		expect(detector.detectEntry(makeCtx(0.5))).toBeNull();
	});

	it("detects buy signal on positive divergence", () => {
		// Oracle 5% higher than spot → buy
		const detector = OracleArbDetector.create(config, () => Decimal.from("0.525"));
		const signal = detector.detectEntry(makeCtx(0.5));
		expect(signal).not.toBeNull();
		expect(signal?.direction).toBe("buy");
		expect(signal?.divergence.isPositive()).toBe(true);
	});

	it("detects sell signal on negative divergence", () => {
		// Oracle 5% lower than spot → sell
		const detector = OracleArbDetector.create(config, () => Decimal.from("0.475"));
		const signal = detector.detectEntry(makeCtx(0.5));
		expect(signal).not.toBeNull();
		expect(signal?.direction).toBe("sell");
		expect(signal?.divergence.isNegative()).toBe(true);
	});

	it("converts signal to order with correct tokenId from config", () => {
		const detector = OracleArbDetector.create(config, () => Decimal.from("0.525"));
		const signal = detector.detectEntry(makeCtx(0.5));
		expect(signal).not.toBeNull();
		// biome-ignore lint/style/noNonNullAssertion: guarded by expect above
		const order = detector.toOrder(signal!, makeCtx(0.5));
		expect(order.tokenId).toBe(config.tokenId);
	});

	it("respects maxDivergencePct", () => {
		const configWithMax = {
			...config,
			maxDivergencePct: Decimal.from("0.05"),
		};
		// 10% divergence > 5% max → reject
		const detector = OracleArbDetector.create(configWithMax, () => Decimal.from("0.55"));
		expect(detector.detectEntry(makeCtx(0.5))).toBeNull();
	});

	it("converts signal to order intent", () => {
		const detector = OracleArbDetector.create(config, () => Decimal.from("0.525"));
		const signal = detector.detectEntry(makeCtx(0.5));
		expect(signal).not.toBeNull();
		expect(signal).not.toBeNull();
		// biome-ignore lint/style/noNonNullAssertion: guarded by expect above
		const order = detector.toOrder(signal!, makeCtx(0.5));
		expect(order.side).toBe(MarketSide.Yes);
		expect(order.size.toString()).toBe("100");
	});
});
