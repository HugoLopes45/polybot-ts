import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { calculateEscapeRoute } from "./dutch-book.js";

describe("calculateEscapeRoute", () => {
	const d = (n: string) => Decimal.from(n);

	it("prefers front door when bid is good and opposite ask is expensive", () => {
		const route = calculateEscapeRoute(
			"yes",
			d("0.60"),
			d("100"),
			d("0.55"),
			d("0.62"),
			d("0.40"),
			d("0.48"),
			d("0.10"),
		);

		expect(route.verdict).toBe("front_door");
		expect(route.recovery.toString()).toBe("55");
		expect(route.hedgeCost.toString()).toBe("0");
		expect(route.netPnl.toString()).toBe("-5");
	});

	it("prefers back door when opposite ask is cheap (YES bid low but NO ask also low)", () => {
		const route = calculateEscapeRoute(
			"yes",
			d("0.60"),
			d("100"),
			d("0.40"),
			d("0.65"),
			d("0.55"),
			d("0.35"),
			d("0.10"),
		);

		expect(route.verdict).toBe("back_door");
		expect(route.recovery.toString()).toBe("100");
		expect(route.hedgeCost.toString()).toBe("35");
		expect(route.netPnl.toString()).toBe("5");
	});

	it("returns trapped when both routes are terrible", () => {
		const route = calculateEscapeRoute(
			"yes",
			d("0.80"),
			d("100"),
			d("0.30"),
			d("0.85"),
			d("0.65"),
			d("0.75"),
			d("0.10"),
		);

		expect(route.verdict).toBe("trapped");
		expect(route.netPnl.lt(d("-8"))).toBe(true);
	});

	it("prefers front door when routes are equal", () => {
		const route = calculateEscapeRoute(
			"yes",
			d("0.50"),
			d("100"),
			d("0.45"),
			d("0.55"),
			d("0.50"),
			d("0.55"),
			d("0.10"),
		);

		expect(route.verdict).toBe("front_door");
		expect(route.recovery.toString()).toBe("45");
		expect(route.hedgeCost.toString()).toBe("0");
		expect(route.netPnl.toString()).toBe("-5");
	});

	it("handles size=0 edge case", () => {
		const route = calculateEscapeRoute(
			"yes",
			d("0.60"),
			d("0"),
			d("0.55"),
			d("0.62"),
			d("0.40"),
			d("0.48"),
			d("0.10"),
		);

		expect(route.verdict).toBe("trapped");
		expect(route.recovery.toString()).toBe("0");
		expect(route.hedgeCost.toString()).toBe("0");
		expect(route.netPnl.toString()).toBe("0");
	});

	it("handles entryPrice=bid edge case (zero P&L front door)", () => {
		const route = calculateEscapeRoute(
			"yes",
			d("0.55"),
			d("100"),
			d("0.55"),
			d("0.62"),
			d("0.40"),
			d("0.50"),
			d("0.10"),
		);

		expect(route.verdict).toBe("front_door");
		expect(route.recovery.toString()).toBe("55");
		expect(route.hedgeCost.toString()).toBe("0");
		expect(route.netPnl.toString()).toBe("0");
	});

	it("behaves symmetrically for YES holder vs NO holder", () => {
		const yesRoute = calculateEscapeRoute(
			"yes",
			d("0.60"),
			d("100"),
			d("0.55"),
			d("0.62"),
			d("0.40"),
			d("0.42"),
			d("0.10"),
		);

		const noRoute = calculateEscapeRoute(
			"no",
			d("0.40"),
			d("100"),
			d("0.58"),
			d("0.60"),
			d("0.38"),
			d("0.45"),
			d("0.10"),
		);

		expect(yesRoute.verdict).toBe("back_door");
		expect(noRoute.verdict).toBe("back_door");
	});

	it.each([
		{
			label: "deep underwater YES, back door wins",
			side: "yes" as const,
			entryPrice: "0.90",
			size: "50",
			yesBid: "0.30",
			yesAsk: "0.35",
			noBid: "0.65",
			noAsk: "0.05",
			minRecovery: "0.10",
			expectedVerdict: "back_door" as const,
			expectedRecovery: "50",
			expectedHedgeCost: "2.5",
		},
		{
			label: "shallow loss YES, front door wins",
			side: "yes" as const,
			entryPrice: "0.55",
			size: "200",
			yesBid: "0.52",
			yesAsk: "0.56",
			noBid: "0.44",
			noAsk: "0.48",
			minRecovery: "0.10",
			expectedVerdict: "front_door" as const,
			expectedRecovery: "104",
			expectedHedgeCost: "0",
		},
		{
			label: "NO position, front door wins",
			side: "no" as const,
			entryPrice: "0.45",
			size: "100",
			yesBid: "0.50",
			yesAsk: "0.60",
			noBid: "0.42",
			noAsk: "0.48",
			minRecovery: "0.10",
			expectedVerdict: "front_door" as const,
			expectedRecovery: "42",
			expectedHedgeCost: "0",
		},
		{
			label: "NO position, back door wins",
			side: "no" as const,
			entryPrice: "0.50",
			size: "100",
			yesBid: "0.40",
			yesAsk: "0.45",
			noBid: "0.30",
			noAsk: "0.35",
			minRecovery: "0.10",
			expectedVerdict: "back_door" as const,
			expectedRecovery: "100",
			expectedHedgeCost: "45",
		},
	])(
		"scenario: $label",
		({
			side,
			entryPrice,
			size,
			yesBid,
			yesAsk,
			noBid,
			noAsk,
			minRecovery,
			expectedVerdict,
			expectedRecovery,
			expectedHedgeCost,
		}) => {
			const route = calculateEscapeRoute(
				side,
				d(entryPrice),
				d(size),
				d(yesBid),
				d(yesAsk),
				d(noBid),
				d(noAsk),
				d(minRecovery),
			);

			expect(route.verdict).toBe(expectedVerdict);
			expect(route.recovery.toString()).toBe(expectedRecovery);
			expect(route.hedgeCost.toString()).toBe(expectedHedgeCost);
		},
	);
});
