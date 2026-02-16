/**
 * Live Paper Loop Example
 *
 * Demonstrates a full tick loop with PaperExecutor:
 * - Implements a simple SignalDetector that buys YES when spread > 3 cents
 * - Builds a strategy using StrategyBuilder
 * - Runs 10 ticks with varying prices
 * - Prints fill history after each tick
 */

import {
	type SignalDetector,
	type DetectorContextLike,
	type SdkOrderIntent,
	StrategyBuilder,
	PaperExecutor,
	TestContextBuilder,
	Decimal,
	MarketSide,
	marketTokenId,
} from "@polybot/sdk";

interface SpreadSignal {
	readonly spread: Decimal;
}

const detector: SignalDetector<unknown, SpreadSignal> = {
	name: "SpreadDetector",

	detectEntry(ctx: DetectorContextLike): SpreadSignal | null {
		const spread = ctx.spread(MarketSide.Yes);
		if (spread !== null && spread.gt(Decimal.from("0.03"))) {
			return { spread };
		}
		return null;
	},

	toOrder(_signal: SpreadSignal, ctx: DetectorContextLike): SdkOrderIntent {
		const bestAsk = ctx.bestAsk(MarketSide.Yes);
		return {
			conditionId: ctx.conditionId,
			tokenId: marketTokenId("yes-token"),
			side: MarketSide.Yes,
			direction: "buy" as const,
			price: bestAsk ?? Decimal.from("0.50"),
			size: Decimal.from("10"),
		};
	},
};

const executor = new PaperExecutor({});

const strategy = StrategyBuilder.create().withDetector(detector).withExecutor(executor).build();

const prices = [
	{ bid: "0.45", ask: "0.50" },
	{ bid: "0.46", ask: "0.51" },
	{ bid: "0.44", ask: "0.49" },
	{ bid: "0.47", ask: "0.52" },
	{ bid: "0.43", ask: "0.48" },
	{ bid: "0.48", ask: "0.53" },
	{ bid: "0.42", ask: "0.47" },
	{ bid: "0.49", ask: "0.54" },
	{ bid: "0.41", ask: "0.46" },
	{ bid: "0.50", ask: "0.55" },
];

async function runLoop() {
	for (let i = 0; i < prices.length; i++) {
		const p = prices[i];
		if (p === undefined) continue;

		const context = new TestContextBuilder()
			.withBestBid(MarketSide.Yes, Decimal.from(p.bid))
			.withBestAsk(MarketSide.Yes, Decimal.from(p.ask))
			.withOraclePrice(Decimal.from("0.55"))
			.build();

		await strategy.tick(context);

		const fills = executor.fillHistory();
		console.log(`Tick ${i + 1}: ${fills.length} fills so far`);
	}

	const totalFills = executor.fillHistory();
	console.log(`\nTotal fills: ${totalFills.length}`);
}

runLoop().catch((err) => {
	console.error("Error:", err);
	process.exit(1);
});
