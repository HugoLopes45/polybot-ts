import { CorrelationEngine, Decimal, OfiTracker, VpinTracker } from "../src/index.js";

const vpin = VpinTracker.create({
	bucketSize: Decimal.from("500"),
	numBuckets: 20,
});

const ofi = OfiTracker.create();

const corr = CorrelationEngine.create({
	windowSize: 30,
	regimeShiftThreshold: Decimal.from("0.3"),
});

const trades = [
	{ price: Decimal.from("0.52"), size: Decimal.from("100"), timestampMs: 1000 },
	{ price: Decimal.from("0.53"), size: Decimal.from("200"), timestampMs: 2000 },
	{ price: Decimal.from("0.51"), size: Decimal.from("150"), timestampMs: 3000 },
	{ price: Decimal.from("0.54"), size: Decimal.from("300"), timestampMs: 4000 },
];

console.log("VPIN Tracker:");
for (const trade of trades) {
	vpin.update(trade);
}

const vpinValue = vpin.value();
console.log(`VPIN Value: ${vpinValue?.toString() ?? "N/A (insufficient data)"}`);

console.log("\nOFI Tracker:");
ofi.update({
	bestBid: { price: Decimal.from("0.50"), size: Decimal.from("500") },
	bestAsk: { price: Decimal.from("0.52"), size: Decimal.from("300") },
});

const delta = ofi.update({
	bestBid: { price: Decimal.from("0.50"), size: Decimal.from("600") },
	bestAsk: { price: Decimal.from("0.52"), size: Decimal.from("250") },
});
console.log(`OFI Delta: ${delta.toString()}`);

console.log("\nCorrelation Engine:");
corr.update(Decimal.from("45000"), Decimal.from("0.65"));
corr.update(Decimal.from("45500"), Decimal.from("0.66"));
const correlation = corr.correlation();
console.log(`Correlation: ${correlation?.toString() ?? "N/A (insufficient data)"}`);
