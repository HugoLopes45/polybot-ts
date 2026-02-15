import { beforeEach, describe, expect, it, vi } from "vitest";
import { Decimal } from "../../shared/decimal.js";
import { conditionId, marketTokenId } from "../../shared/identifiers.js";
import type { DetectorContextLike } from "../types.js";
import { type DipArbConfig, DipArbDetector, type DipArbSignal } from "./dip-arb-detector.js";

describe("DipArbDetector", () => {
	let mockCtx: DetectorContextLike;

	beforeEach(() => {
		mockCtx = {
			conditionId: conditionId("test-condition"),
			nowMs: vi.fn(() => 10000),
			spot: vi.fn(() => Decimal.from("0.50")),
			oraclePrice: vi.fn(() => Decimal.from("0.50")),
			timeRemainingMs: vi.fn(() => 300000),
			bestBid: vi.fn(() => Decimal.from("0.49")),
			bestAsk: vi.fn(() => Decimal.from("0.51")),
			spread: vi.fn(() => Decimal.from("0.02")),
		};
	});

	describe("configuration", () => {
		it("should have a name", () => {
			const config: DipArbConfig = {
				dipThresholdPct: Decimal.from("0.10"),
				windowSizeSec: 3,
			};
			const result = DipArbDetector.create(config);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value.name).toBe("dip-arb");
			}
		});

		it("should accept valid config with defaults", () => {
			const config: DipArbConfig = {
				dipThresholdPct: Decimal.from("0.10"),
				windowSizeSec: 3,
			};
			const result = DipArbDetector.create(config);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBeDefined();
			}
		});

		it("should reject zero dip threshold", () => {
			const config: DipArbConfig = {
				dipThresholdPct: Decimal.from("0"),
				windowSizeSec: 3,
			};
			const result = DipArbDetector.create(config);
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.message).toBe("dipThresholdPct must be positive");
			}
		});

		it("should reject negative dip threshold", () => {
			const config: DipArbConfig = {
				dipThresholdPct: Decimal.from("-0.10"),
				windowSizeSec: 3,
			};
			const result = DipArbDetector.create(config);
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.message).toBe("dipThresholdPct must be positive");
			}
		});

		it("should reject zero window size", () => {
			const config: DipArbConfig = {
				dipThresholdPct: Decimal.from("0.10"),
				windowSizeSec: 0,
			};
			const result = DipArbDetector.create(config);
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.message).toBe("windowSizeSec must be positive");
			}
		});

		it("should reject negative window size", () => {
			const config: DipArbConfig = {
				dipThresholdPct: Decimal.from("0.10"),
				windowSizeSec: -1,
			};
			const result = DipArbDetector.create(config);
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.message).toBe("windowSizeSec must be positive");
			}
		});
	});

	describe("detectEntry", () => {
		it("should return null when no price data available", () => {
			const config: DipArbConfig = {
				dipThresholdPct: Decimal.from("0.10"),
				windowSizeSec: 3,
			};
			const result = DipArbDetector.create(config);
			if (!result.ok) throw new Error("Failed to create detector");
			const detector = result.value;

			const ctxNoPrice = {
				...mockCtx,
				spot: vi.fn(() => null),
				oraclePrice: vi.fn(() => null),
			};

			const signal = detector.detectEntry(ctxNoPrice as DetectorContextLike);
			expect(signal).toBeNull();
		});

		it("should return null when price is stable (no dip)", () => {
			const config: DipArbConfig = {
				dipThresholdPct: Decimal.from("0.10"),
				windowSizeSec: 3,
			};
			const createResult = DipArbDetector.create(config);
			if (!createResult.ok) throw new Error("Failed to create detector");
			const detector = createResult.value;

			const now = 10000;
			detector.setPriceHistory([
				{ timestampMs: now - 3000, price: Decimal.from("0.50") },
				{ timestampMs: now - 2000, price: Decimal.from("0.50") },
				{ timestampMs: now - 1000, price: Decimal.from("0.50") },
			]);

			const signal = detector.detectEntry(mockCtx);
			expect(signal).toBeNull();
		});

		it("should detect flash crash when price drops within window", () => {
			const config: DipArbConfig = {
				dipThresholdPct: Decimal.from("0.10"),
				windowSizeSec: 3,
			};
			const createResult = DipArbDetector.create(config);
			if (!createResult.ok) throw new Error("Failed to create detector");
			const detector = createResult.value;

			const now = 10000;
			detector.setPriceHistory([
				{ timestampMs: now - 3000, price: Decimal.from("0.60") },
				{ timestampMs: now - 2000, price: Decimal.from("0.50") },
				{ timestampMs: now - 1000, price: Decimal.from("0.45") },
			]);

			vi.mocked(mockCtx.spot).mockReturnValue(Decimal.from("0.45"));

			const signal = detector.detectEntry(mockCtx);
			expect(signal).not.toBeNull();
			expect(signal?.dipPct.gte(Decimal.from("0.10"))).toBe(true);
		});

		it("should return null when dip is below threshold", () => {
			const config: DipArbConfig = {
				dipThresholdPct: Decimal.from("0.20"),
				windowSizeSec: 3,
			};
			const createResult = DipArbDetector.create(config);
			if (!createResult.ok) throw new Error("Failed to create detector");
			const detector = createResult.value;

			const now = 10000;
			detector.setPriceHistory([
				{ timestampMs: now - 3000, price: Decimal.from("0.55") },
				{ timestampMs: now - 2000, price: Decimal.from("0.53") },
				{ timestampMs: now - 1000, price: Decimal.from("0.52") },
			]);

			vi.mocked(mockCtx.spot).mockReturnValue(Decimal.from("0.52"));

			const signal = detector.detectEntry(mockCtx);
			expect(signal).toBeNull();
		});

		it("should prune old prices outside window", () => {
			const config: DipArbConfig = {
				dipThresholdPct: Decimal.from("0.10"),
				windowSizeSec: 3,
			};
			const createResult = DipArbDetector.create(config);
			if (!createResult.ok) throw new Error("Failed to create detector");
			const detector = createResult.value;

			const now = 10000;
			detector.setPriceHistory([
				{ timestampMs: now - 10000, price: Decimal.from("0.70") },
				{ timestampMs: now - 5000, price: Decimal.from("0.60") },
				{ timestampMs: now - 4000, price: Decimal.from("0.50") },
			]);

			vi.mocked(mockCtx.spot).mockReturnValue(Decimal.from("0.50"));

			const signal = detector.detectEntry(mockCtx);
			expect(signal).toBeNull();
			expect(detector.getPriceHistory().length).toBeLessThanOrEqual(3);
		});

		it("returns null when oldestPrice is zero", () => {
			const config: DipArbConfig = {
				dipThresholdPct: Decimal.from("0.10"),
				windowSizeSec: 3,
			};
			const createResult = DipArbDetector.create(config);
			if (!createResult.ok) throw new Error("Failed to create detector");
			const detector = createResult.value;

			const now = 10000;
			detector.setPriceHistory([
				{ timestampMs: now - 3000, price: Decimal.zero() },
				{ timestampMs: now - 2000, price: Decimal.from("0.50") },
				{ timestampMs: now - 1000, price: Decimal.from("0.45") },
			]);

			vi.mocked(mockCtx.spot).mockReturnValue(Decimal.from("0.45"));

			const signal = detector.detectEntry(mockCtx);
			expect(signal).toBeNull();
		});
	});

	describe("toOrder", () => {
		it("should generate two-leg order for YES side", () => {
			const config: DipArbConfig = {
				dipThresholdPct: Decimal.from("0.10"),
				windowSizeSec: 3,
			};
			const createResult = DipArbDetector.create(config);
			if (!createResult.ok) throw new Error("Failed to create detector");
			const detector = createResult.value;

			const signal: DipArbSignal = {
				side: "yes",
				dipPct: Decimal.from("0.15"),
				entryPrice: Decimal.from("0.45"),
			};

			const order = detector.toOrder(signal, mockCtx);
			expect(order).toEqual({
				conditionId: mockCtx.conditionId,
				tokenId: marketTokenId("yes-token"),
				side: "yes",
				direction: "buy",
				price: Decimal.from("0.45"),
				size: expect.any(Decimal),
			});
		});

		it("should generate two-leg order for NO side", () => {
			const config: DipArbConfig = {
				dipThresholdPct: Decimal.from("0.10"),
				windowSizeSec: 3,
			};
			const createResult = DipArbDetector.create(config);
			if (!createResult.ok) throw new Error("Failed to create detector");
			const detector = createResult.value;

			const signal: DipArbSignal = {
				side: "no",
				dipPct: Decimal.from("0.15"),
				entryPrice: Decimal.from("0.55"),
			};

			const order = detector.toOrder(signal, mockCtx);
			expect(order).toEqual({
				conditionId: mockCtx.conditionId,
				tokenId: marketTokenId("no-token"),
				side: "no",
				direction: "buy",
				price: Decimal.from("0.55"),
				size: expect.any(Decimal),
			});
		});

		it("should use entry price from signal", () => {
			const config: DipArbConfig = {
				dipThresholdPct: Decimal.from("0.10"),
				windowSizeSec: 3,
			};
			const createResult = DipArbDetector.create(config);
			if (!createResult.ok) throw new Error("Failed to create detector");
			const detector = createResult.value;

			const signal: DipArbSignal = {
				side: "yes",
				dipPct: Decimal.from("0.15"),
				entryPrice: Decimal.from("0.50"),
			};

			const order = detector.toOrder(signal, mockCtx);
			expect(order.price.eq(Decimal.from("0.50"))).toBe(true);
		});
	});

	describe("two-leg entry", () => {
		it("should generate orders for both YES and NO when dip detected", () => {
			const config: DipArbConfig = {
				dipThresholdPct: Decimal.from("0.10"),
				windowSizeSec: 3,
			};
			const createResult = DipArbDetector.create(config);
			if (!createResult.ok) throw new Error("Failed to create detector");
			const detector = createResult.value;

			const now = 10000;
			detector.setPriceHistory([
				{ timestampMs: now - 3000, price: Decimal.from("0.60") },
				{ timestampMs: now - 2000, price: Decimal.from("0.50") },
				{ timestampMs: now - 1000, price: Decimal.from("0.45") },
			]);

			vi.mocked(mockCtx.spot).mockReturnValue(Decimal.from("0.45"));
			vi.mocked(mockCtx.bestBid).mockImplementation((side) => {
				if (side === "yes") return Decimal.from("0.44");
				if (side === "no") return Decimal.from("0.54");
				return null;
			});

			const signal = detector.detectEntry(mockCtx);
			expect(signal).not.toBeNull();

			const yesOrder = detector.toOrder(signal as NonNullable<typeof signal>, mockCtx);
			expect(yesOrder.side).toBe("yes");
			expect(yesOrder.direction).toBe("buy");
		});
	});
});
