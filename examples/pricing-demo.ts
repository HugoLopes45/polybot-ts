/**
 * Pricing Demo — Black-Scholes, Weighted Oracle, and Dutch Book analysis.
 *
 * Demonstrates pricing models for prediction market fair value estimation.
 *
 * Run: npx tsx -p tsconfig.examples.json examples/pricing-demo.ts
 */

import {
	Decimal,
	SystemClock,
	WeightedOracle,
	binaryCallPrice,
	calcEdge,
	calculateEscapeRoute,
} from "@polybot/sdk";

console.log("Black-Scholes Pricing:");
const fairPrice = binaryCallPrice({
	spot: Decimal.from("0.48"),
	vol: Decimal.from("0.75"),
	timeToExpiry: Decimal.from("0.0417"),
	riskFreeRate: Decimal.from("0.00"),
});
console.log(`Fair Price: ${fairPrice.toString()}`);

const marketAsk = Decimal.from("0.42");
const edge = calcEdge(fairPrice, marketAsk);
console.log(`Market Ask: ${marketAsk.toString()}`);
console.log(`Edge: ${edge.toString()}`);

console.log("\nWeighted Oracle:");
const oracle = WeightedOracle.create(
	{
		sources: [
			{ name: "clob", weight: Decimal.from("0.6"), maxAgeMs: 10_000 },
			{ name: "cpmm", weight: Decimal.from("0.4"), maxAgeMs: 30_000 },
		],
		maxDivergence: Decimal.from("0.05"),
		minActiveSources: 1,
	},
	SystemClock,
);

oracle.update({ source: "clob", price: Decimal.from("0.50"), timestampMs: Date.now() });
oracle.update({ source: "cpmm", price: Decimal.from("0.49"), timestampMs: Date.now() });
const aggregated = oracle.aggregate();
console.log(`Aggregated Price: ${aggregated?.price.toString() ?? "N/A (no active sources)"}`);

console.log("\nDutch Book Escape:");
const escapeRoute = calculateEscapeRoute(
	"yes",
	Decimal.from("0.70"),
	Decimal.from("100"),
	Decimal.from("0.40"),
	Decimal.from("0.45"),
	Decimal.from("0.55"),
	Decimal.from("0.60"),
);
console.log(`Verdict: ${escapeRoute.verdict}`);
console.log(`Recovery: ${escapeRoute.recovery.toString()}`);
console.log(`Net P&L: ${escapeRoute.netPnl.toString()}`);
