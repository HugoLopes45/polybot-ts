import { describe, expect, it } from "vitest";
import { OnlineRegression } from "./online-regression.js";

describe("OnlineRegression", () => {
	it("returns null stats with fewer than 2 points", () => {
		const reg = OnlineRegression.create();
		expect(reg.stats()).toBeNull();

		reg.update(1, 2);
		expect(reg.stats()).toBeNull();
	});

	it("fits perfect linear data (y = 2x + 1)", () => {
		const reg = OnlineRegression.create();
		for (let x = 0; x <= 10; x++) {
			reg.update(x, 2 * x + 1);
		}
		const s = reg.stats();
		expect(s).not.toBeNull();
		expect(s?.slope.toNumber()).toBeCloseTo(2, 6);
		expect(s?.intercept.toNumber()).toBeCloseTo(1, 6);
		expect(s?.r2.toNumber()).toBeCloseTo(1, 6);
		expect(s?.n).toBe(11);
	});

	it("predicts correctly after fitting", () => {
		const reg = OnlineRegression.create();
		for (let x = 0; x <= 10; x++) {
			reg.update(x, 3 * x - 2);
		}
		const predicted = reg.predict(5);
		expect(predicted).not.toBeNull();
		expect(predicted?.toNumber()).toBeCloseTo(13, 6);
	});

	it("returns null prediction with fewer than 2 points", () => {
		const reg = OnlineRegression.create();
		expect(reg.predict(5)).toBeNull();
	});

	it("tracks count correctly", () => {
		const reg = OnlineRegression.create();
		expect(reg.count).toBe(0);
		reg.update(1, 1);
		expect(reg.count).toBe(1);
		reg.update(2, 2);
		expect(reg.count).toBe(2);
	});

	it("resets all state", () => {
		const reg = OnlineRegression.create();
		reg.update(1, 2);
		reg.update(2, 4);
		reg.reset();
		expect(reg.count).toBe(0);
		expect(reg.stats()).toBeNull();
	});

	it("handles zero variance in X gracefully", () => {
		const reg = OnlineRegression.create();
		reg.update(5, 1);
		reg.update(5, 2);
		reg.update(5, 3);
		const s = reg.stats();
		expect(s).not.toBeNull();
		expect(s?.slope.toNumber()).toBe(0);
		expect(s?.r2.toNumber()).toBe(0);
	});

	it("handles negative slope", () => {
		const reg = OnlineRegression.create();
		for (let x = 0; x <= 10; x++) {
			reg.update(x, 100 - 5 * x);
		}
		const s = reg.stats();
		expect(s).not.toBeNull();
		expect(s?.slope.toNumber()).toBeCloseTo(-5, 6);
		expect(s?.intercept.toNumber()).toBeCloseTo(100, 6);
	});

	it("computes reasonable R² for noisy data", () => {
		const reg = OnlineRegression.create();
		// y = 2x + noise
		const data: Array<{ x: number; y: number }> = [
			{ x: 1, y: 2.1 },
			{ x: 2, y: 4.3 },
			{ x: 3, y: 5.8 },
			{ x: 4, y: 8.2 },
			{ x: 5, y: 10.1 },
			{ x: 6, y: 11.9 },
			{ x: 7, y: 14.3 },
			{ x: 8, y: 16.0 },
		];
		for (const { x, y } of data) {
			reg.update(x, y);
		}
		const s = reg.stats();
		expect(s).not.toBeNull();
		expect(s?.r2.toNumber()).toBeGreaterThan(0.99);
		expect(s?.slope.toNumber()).toBeCloseTo(2, 0);
	});
});
