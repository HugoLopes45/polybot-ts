import { bench, describe } from "vitest";
import { Decimal } from "../src/shared/decimal.js";
import { KellySizer } from "../src/sizing/kelly-sizer.js";

describe("kelly sizing", () => {
	const sizer = KellySizer.half();
	const input = {
		balance: Decimal.from("10000"),
		edge: Decimal.from("0.05"),
		marketPrice: Decimal.from("0.55"),
	};

	bench("half-kelly size 1000x", () => {
		for (let i = 0; i < 1000; i++) {
			sizer.size(input);
		}
	});

	bench("full-kelly size 1000x", () => {
		const full = KellySizer.full();
		for (let i = 0; i < 1000; i++) {
			full.size(input);
		}
	});

	bench("quarter-kelly size 1000x", () => {
		const quarter = KellySizer.quarter();
		for (let i = 0; i < 1000; i++) {
			quarter.size(input);
		}
	});
});
