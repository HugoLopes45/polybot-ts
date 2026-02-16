import {
	binaryCallPrice,
	calcEdge,
	calculateEscapeRoute,
	Decimal,
	SystemClock,
	WeightedOracle,
} from "../src/index.js";

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
console.log(`Aggregated Price: ${aggregated.isOk() ? aggregated.value.toString() : "Error"}`);

console.log("\nDutch Book Escape:");
const escape = calculateEscapeRoute(
	"yes",
	Decimal.from("0.70"),
	Decimal.from("100"),
	Decimal.from("0.40"),
	Decimal.from("0.45"),
	Decimal.from("0.55"),
	Decimal.from("0.60"),
);
console.log(`Verdict: ${escape.verdict}`);
console.log(`Recovery: ${escape.recovery.toString()}`);
console.log(`Net P&L: ${escape.netPnl.toString()}`);
