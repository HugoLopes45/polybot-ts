import { bench, describe } from "vitest";
import { Decimal } from "../src/shared/decimal.js";

describe("arbitrage check", () => {
	bench("edge calculation 1000x", () => {
		const yes = Decimal.from("0.52");
		const no = Decimal.from("0.45");
		for (let i = 0; i < 1000; i++) {
			const _edge = Decimal.one().sub(yes).sub(no);
		}
	});

	bench("arb detection with threshold", () => {
		const threshold = Decimal.from("0.98");
		const yes = Decimal.from("0.52");
		const no = Decimal.from("0.45");
		for (let i = 0; i < 1000; i++) {
			const sum = yes.add(no);
			const _isArb = sum.lt(threshold);
		}
	});
});
