import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { LogitTransferModel } from "./logit-transfer.js";

describe("LogitTransferModel", () => {
	it("returns null prediction with insufficient samples", () => {
		const model = LogitTransferModel.create({ minSamples: 10 });
		model.observe(Decimal.from("100"), Decimal.from("0.5"));
		expect(model.predict(Decimal.from("100"))).toBeNull();
	});

	it("returns valid prediction with correlated data", () => {
		const model = LogitTransferModel.create({ minSamples: 5 });
		// Feed correlated data: higher price → higher prob
		const pairs = [
			{ price: 90, prob: 0.3 },
			{ price: 95, prob: 0.4 },
			{ price: 100, prob: 0.5 },
			{ price: 105, prob: 0.6 },
			{ price: 110, prob: 0.7 },
			{ price: 115, prob: 0.75 },
			{ price: 120, prob: 0.8 },
		];
		for (const { price, prob } of pairs) {
			model.observe(Decimal.from(price), Decimal.from(prob));
		}

		const prediction = model.predict(Decimal.from("105"));
		expect(prediction).not.toBeNull();
		expect(prediction?.valid).toBe(true);
		expect(prediction?.predictedProb.toNumber()).toBeGreaterThan(0);
		expect(prediction?.predictedProb.toNumber()).toBeLessThan(1);
		expect(prediction?.sampleCount).toBe(7);
	});

	it("returns invalid prediction when R² is too low", () => {
		const model = LogitTransferModel.create({
			minSamples: 3,
			minR2: Decimal.from("0.9"),
		});
		// Feed random/uncorrelated data
		model.observe(Decimal.from("100"), Decimal.from("0.3"));
		model.observe(Decimal.from("200"), Decimal.from("0.3"));
		model.observe(Decimal.from("150"), Decimal.from("0.9"));
		model.observe(Decimal.from("50"), Decimal.from("0.1"));

		const prediction = model.predict(Decimal.from("100"));
		// Low R² should make it invalid
		if (prediction !== null) {
			expect(prediction.valid).toBe(false);
		}
	});

	it("detects ghost book (constant market prob)", () => {
		const model = LogitTransferModel.create({
			minSamples: 3,
			maxFlatReadings: 5,
		});
		for (let i = 0; i < 10; i++) {
			model.observe(Decimal.from(100 + i), Decimal.from("0.5"));
		}
		expect(model.isGhostBook()).toBe(true);
	});

	it("does not flag ghost book with varying probs", () => {
		const model = LogitTransferModel.create({ maxFlatReadings: 5 });
		model.observe(Decimal.from("100"), Decimal.from("0.50"));
		model.observe(Decimal.from("101"), Decimal.from("0.51"));
		model.observe(Decimal.from("102"), Decimal.from("0.52"));
		expect(model.isGhostBook()).toBe(false);
	});

	it("ghost book invalidates prediction", () => {
		const model = LogitTransferModel.create({
			minSamples: 3,
			maxFlatReadings: 5,
		});
		// 6 flat readings → ghost book
		for (let i = 0; i < 6; i++) {
			model.observe(Decimal.from(100 + i), Decimal.from("0.5"));
		}
		expect(model.isGhostBook()).toBe(true);
		expect(model.predict(Decimal.from("100"))).toBeNull();
	});

	it("resets all state", () => {
		const model = LogitTransferModel.create({ minSamples: 3 });
		for (let i = 0; i < 5; i++) {
			model.observe(Decimal.from(100 + i), Decimal.from(0.5 + i * 0.05));
		}
		model.reset();
		expect(model.predict(Decimal.from("100"))).toBeNull();
		expect(model.isGhostBook()).toBe(false);
	});

	it("silently skips observe with zero cexPrice (avoids Math.log(0))", () => {
		const model = LogitTransferModel.create({ minSamples: 3 });
		// Feed valid data first
		const pairs = [
			{ price: 90, prob: 0.3 },
			{ price: 100, prob: 0.5 },
			{ price: 110, prob: 0.7 },
		];
		for (const { price, prob } of pairs) {
			model.observe(Decimal.from(price), Decimal.from(prob));
		}

		// Observe zero price — should be silently skipped, not corrupt regression
		model.observe(Decimal.zero(), Decimal.from("0.5"));

		const prediction = model.predict(Decimal.from("100"));
		expect(prediction).not.toBeNull();
		expect(prediction?.valid).toBe(true);
		expect(prediction?.sampleCount).toBe(3); // zero-price observation not counted
	});

	it("silently skips observe with negative cexPrice", () => {
		const model = LogitTransferModel.create({ minSamples: 3 });
		model.observe(Decimal.from("-1"), Decimal.from("0.5"));

		// Should have no samples
		expect(model.predict(Decimal.from("100"))).toBeNull();
	});

	it("returns null from predict with zero cexPrice", () => {
		const model = LogitTransferModel.create({ minSamples: 3 });
		const pairs = [
			{ price: 90, prob: 0.3 },
			{ price: 100, prob: 0.5 },
			{ price: 110, prob: 0.7 },
		];
		for (const { price, prob } of pairs) {
			model.observe(Decimal.from(price), Decimal.from(prob));
		}

		expect(model.predict(Decimal.zero())).toBeNull();
	});

	it("clamps extreme probabilities (avoids Infinity in logit)", () => {
		const model = LogitTransferModel.create({ minSamples: 2 });
		// Prob of 0 and 1 should be clamped, not produce Infinity
		expect(() => {
			model.observe(Decimal.from("100"), Decimal.from("0"));
			model.observe(Decimal.from("200"), Decimal.from("1"));
			model.observe(Decimal.from("150"), Decimal.from("0.5"));
		}).not.toThrow();
	});

	it("sigmoid output always bounded (0, 1)", () => {
		const model = LogitTransferModel.create({ minSamples: 3 });
		const pairs = [
			{ price: 50, prob: 0.2 },
			{ price: 100, prob: 0.5 },
			{ price: 200, prob: 0.8 },
		];
		for (const { price, prob } of pairs) {
			model.observe(Decimal.from(price), Decimal.from(prob));
		}

		// Predict at extreme values
		for (const price of [1, 10, 1000, 10000]) {
			const pred = model.predict(Decimal.from(price));
			if (pred?.valid) {
				expect(pred.predictedProb.toNumber()).toBeGreaterThan(0);
				expect(pred.predictedProb.toNumber()).toBeLessThan(1);
			}
		}
	});
});
