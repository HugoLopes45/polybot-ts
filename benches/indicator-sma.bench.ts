import { bench, describe } from "vitest";
import { calcEMA, calcRSI, calcSMA } from "../src/analytics/indicators.js";
import { Decimal } from "../src/shared/decimal.js";

function generateCloses(n: number): Decimal[] {
	const closes: Decimal[] = [];
	let price = 0.5;
	for (let i = 0; i < n; i++) {
		price += (Math.random() - 0.5) * 0.02;
		price = Math.max(0.01, Math.min(0.99, price));
		closes.push(Decimal.from(price.toFixed(4)));
	}
	return closes;
}

const closes100 = generateCloses(100);
const closes500 = generateCloses(500);

describe("SMA indicator", () => {
	bench("SMA-20 over 100 closes", () => {
		calcSMA(closes100, 20);
	});

	bench("SMA-50 over 500 closes", () => {
		calcSMA(closes500, 50);
	});
});

describe("EMA indicator", () => {
	bench("EMA-20 over 100 closes", () => {
		calcEMA(closes100, 20);
	});

	bench("EMA-50 over 500 closes", () => {
		calcEMA(closes500, 50);
	});
});

describe("RSI indicator", () => {
	bench("RSI-14 over 100 closes", () => {
		calcRSI(closes100, 14);
	});

	bench("RSI-14 over 500 closes", () => {
		calcRSI(closes500, 14);
	});
});
