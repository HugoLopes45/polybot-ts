import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { CommissionModel, FixedBpsSlippage, SizeProportionalSlippage } from "./slippage-model.js";

const d = (v: string | number) => Decimal.from(v);

describe("FixedBpsSlippage", () => {
	it("adds slippage for buys", () => {
		const model = FixedBpsSlippage.create(10); // 10 bps = 0.1%
		const result = model.apply(d("0.50"), d("100"), true);
		// 0.50 + 0.50 * 10/10000 = 0.50 + 0.0005 = 0.5005
		expect(result.toNumber()).toBeCloseTo(0.5005, 4);
	});

	it("subtracts slippage for sells", () => {
		const model = FixedBpsSlippage.create(10);
		const result = model.apply(d("0.50"), d("100"), false);
		expect(result.toNumber()).toBeCloseTo(0.4995, 4);
	});

	it("zero bps means no slippage", () => {
		const model = FixedBpsSlippage.create(0);
		const result = model.apply(d("0.50"), d("100"), true);
		expect(result.toNumber()).toBe(0.5);
	});
});

describe("SizeProportionalSlippage", () => {
	it("larger orders get more slippage", () => {
		const model = SizeProportionalSlippage.create(100, 10000); // 100 bps per full ADV
		const small = model.apply(d("0.50"), d("100"), true);
		const large = model.apply(d("0.50"), d("5000"), true);
		expect(large.toNumber()).toBeGreaterThan(small.toNumber());
	});

	it("zero ADV returns intended price", () => {
		const model = SizeProportionalSlippage.create(100, 0);
		const result = model.apply(d("0.50"), d("100"), true);
		expect(result.toNumber()).toBe(0.5);
	});

	it("zero size means no slippage", () => {
		const model = SizeProportionalSlippage.create(100, 10000);
		const result = model.apply(d("0.50"), d("0"), true);
		expect(result.toNumber()).toBe(0.5);
	});
});

describe("CommissionModel", () => {
	it("calculates flat fee", () => {
		const model = CommissionModel.flat(0.01);
		expect(model.calc(d("100")).toNumber()).toBeCloseTo(0.01, 4);
	});

	it("calculates percentage fee", () => {
		const model = CommissionModel.percentage(0.1); // 0.1%
		expect(model.calc(d("100")).toNumber()).toBeCloseTo(0.1, 4);
	});

	it("calculates combined fees", () => {
		const model = CommissionModel.combined(0.01, 0.1);
		// flat 0.01 + 0.1% of 100 = 0.01 + 0.1 = 0.11
		expect(model.calc(d("100")).toNumber()).toBeCloseTo(0.11, 4);
	});
});
