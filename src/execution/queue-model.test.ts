import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { QueueModel } from "./queue-model.js";

describe("QueueModel", () => {
	describe("create", () => {
		it("should create with default config", () => {
			const model = QueueModel.create();
			expect(model).toBeDefined();
		});

		it("should create with partial config", () => {
			const model = QueueModel.create({ baseFillRate: 0.5 });
			expect(model).toBeDefined();
		});
	});

	describe("enqueue", () => {
		it("should create entry with queuePosition = 1.0", () => {
			const model = QueueModel.create();
			const price = Decimal.from(0.5);
			const size = Decimal.from(10);
			const entry = model.enqueue(price, size, true, 1000);
			expect(entry.price).toBeDefined();
			expect(entry.price).toBeInstanceOf(Decimal);
			expect(entry.price.eq(Decimal.from(0.5))).toBe(true);
			expect(entry.size.eq(Decimal.from(10))).toBe(true);
			expect(entry.isBuy).toBe(true);
			expect(entry.enqueuedAtMs).toBe(1000);
			expect(entry.queuePosition).toBe(1.0);
		});

		it("should create sell entry", () => {
			const model = QueueModel.create();
			const entry = model.enqueue(Decimal.from(0.6), Decimal.from(5), false, 2000);
			expect(entry.isBuy).toBe(false);
			expect(entry.enqueuedAtMs).toBe(2000);
		});
	});

	describe("tryFill", () => {
		it("should return null when queue position is high (just enqueued)", () => {
			const model = QueueModel.create({ baseFillRate: 0.3, rng: () => 0.5 });
			const entry = model.enqueue(Decimal.from(0.5), Decimal.from(1), true, 1000);
			const fillPrice = model.tryFill(entry, Decimal.from(0.49), Decimal.from(0.51), 1000);
			expect(fillPrice).toBeNull();
		});

		it("should fill when queue position has decayed sufficiently", () => {
			const model = QueueModel.create({
				baseFillRate: 0.3,
				queueDecayRate: 0.05,
				rng: () => 0.1,
			});
			const entry = model.enqueue(Decimal.from(0.5), Decimal.from(1), true, 1000);
			const fillPrice = model.tryFill(entry, Decimal.from(0.49), Decimal.from(0.5), 11000);
			expect(fillPrice).not.toBeNull();
		});

		it("should fill buy when ask drops below entry price (adverse selection)", () => {
			const model = QueueModel.create({
				baseFillRate: 0.3,
				adverseSelectionFactor: 10.0,
				rng: () => 0.15,
			});
			const entry = model.enqueue(Decimal.from(0.5), Decimal.from(1), true, 1000);
			const fillPrice = model.tryFill(entry, Decimal.from(0.48), Decimal.from(0.49), 1000);
			expect(fillPrice).not.toBeNull();
		});

		it("should fill sell when bid rises above entry price (adverse selection)", () => {
			const model = QueueModel.create({
				baseFillRate: 0.3,
				adverseSelectionFactor: 10.0,
				rng: () => 0.15,
			});
			const entry = model.enqueue(Decimal.from(0.5), Decimal.from(1), false, 1000);
			const fillPrice = model.tryFill(entry, Decimal.from(0.51), Decimal.from(0.52), 1000);
			expect(fillPrice).not.toBeNull();
		});

		it("should apply size penalty (larger orders fill less frequently)", () => {
			const modelSmall = QueueModel.create({
				baseFillRate: 1.0,
				sizePenalty: 0.01,
				queueDecayRate: 0.1,
				rng: () => 0.45,
			});
			const modelLarge = QueueModel.create({
				baseFillRate: 1.0,
				sizePenalty: 0.01,
				queueDecayRate: 0.1,
				rng: () => 0.45,
			});

			const smallEntry = modelSmall.enqueue(Decimal.from(0.5), Decimal.from(1), true, 1000);
			const largeEntry = modelLarge.enqueue(Decimal.from(0.5), Decimal.from(100), true, 1000);

			const smallFill = modelSmall.tryFill(smallEntry, Decimal.from(0.49), Decimal.from(0.5), 6000);
			const largeFill = modelLarge.tryFill(largeEntry, Decimal.from(0.49), Decimal.from(0.5), 6000);

			expect(smallFill).not.toBeNull();
			expect(largeFill).toBeNull();
		});

		it("should use custom rng for deterministic tests", () => {
			let callCount = 0;
			const rng = () => {
				callCount++;
				return 0.1;
			};
			const model = QueueModel.create({ baseFillRate: 0.3, queueDecayRate: 0.1, rng });
			const entry = model.enqueue(Decimal.from(0.5), Decimal.from(1), true, 1000);
			model.tryFill(entry, Decimal.from(0.49), Decimal.from(0.5), 3000);
			expect(callCount).toBe(1);
		});

		it("should return effective fill price for buy (min of entry price and current ask)", () => {
			const model = QueueModel.create({
				baseFillRate: 0.3,
				adverseSelectionFactor: 10.0,
				rng: () => 0.1,
			});
			const entry = model.enqueue(Decimal.from(0.5), Decimal.from(1), true, 1000);
			const fillPrice = model.tryFill(entry, Decimal.from(0.48), Decimal.from(0.49), 1000);
			expect(fillPrice).not.toBeNull();
			expect(fillPrice?.eq(Decimal.from(0.49))).toBe(true);
		});

		it("should return effective fill price for sell (max of entry price and current bid)", () => {
			const model = QueueModel.create({
				baseFillRate: 0.3,
				adverseSelectionFactor: 10.0,
				rng: () => 0.1,
			});
			const entry = model.enqueue(Decimal.from(0.5), Decimal.from(1), false, 1000);
			const fillPrice = model.tryFill(entry, Decimal.from(0.51), Decimal.from(0.52), 1000);
			expect(fillPrice).not.toBeNull();
			expect(fillPrice?.eq(Decimal.from(0.51))).toBe(true);
		});
	});

	describe("remove", () => {
		it("should remove entry from tracking", () => {
			const model = QueueModel.create();
			const entry = model.enqueue(Decimal.from(0.5), Decimal.from(1), true, 1000);
			model.remove(entry);
			expect(model.tryFill(entry, Decimal.from(0.49), Decimal.from(0.5), 2000)).toBeNull();
		});
	});

	describe("multiple entries", () => {
		it("should track multiple entries independently", () => {
			const model = QueueModel.create({ baseFillRate: 1.0, queueDecayRate: 0.2, rng: () => 0.3 });
			const entry1 = model.enqueue(Decimal.from(0.5), Decimal.from(1), true, 1000);
			const entry2 = model.enqueue(Decimal.from(0.6), Decimal.from(1), false, 2000);

			const fill1 = model.tryFill(entry1, Decimal.from(0.49), Decimal.from(0.5), 3000);
			const fill2 = model.tryFill(entry2, Decimal.from(0.59), Decimal.from(0.61), 3000);

			expect(fill1).not.toBeNull();
			expect(fill2).toBeNull();
		});
	});

	describe("edge cases", () => {
		it("should clamp fill probability to [0, 1]", () => {
			const model = QueueModel.create({
				baseFillRate: 2.0,
				adverseSelectionFactor: 10.0,
				rng: () => 0.9,
			});
			const entry = model.enqueue(Decimal.from(0.5), Decimal.from(1), true, 1000);
			const fillPrice = model.tryFill(entry, Decimal.from(0.3), Decimal.from(0.35), 1000);
			expect(fillPrice).not.toBeNull();
		});

		it("should handle zero queue decay rate", () => {
			const model = QueueModel.create({ baseFillRate: 0.3, queueDecayRate: 0, rng: () => 0.1 });
			const entry = model.enqueue(Decimal.from(0.5), Decimal.from(1), true, 1000);
			const fillPrice = model.tryFill(entry, Decimal.from(0.49), Decimal.from(0.5), 10000);
			expect(fillPrice).toBeNull();
		});

		it("should handle zero size penalty", () => {
			const model = QueueModel.create({
				baseFillRate: 1.0,
				sizePenalty: 0,
				queueDecayRate: 0.15,
				rng: () => 0.3,
			});
			const entry = model.enqueue(Decimal.from(0.5), Decimal.from(100), true, 1000);
			const fillPrice = model.tryFill(entry, Decimal.from(0.49), Decimal.from(0.5), 3000);
			expect(fillPrice).not.toBeNull();
		});
	});
});
