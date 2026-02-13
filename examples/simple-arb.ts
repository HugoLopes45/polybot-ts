/**
 * Simple Arbitrage — buys YES when price < oracle, sells when profitable.
 *
 * Uses PaperExecutor for backtesting (no real orders).
 * Run: npx tsx examples/simple-arb.ts
 */

import {
	Decimal,
	type DetectorContextLike,
	PaperExecutor,
	type SdkOrderIntent,
	type SignalDetector,
	StrategyBuilder,
	marketTokenId,
} from "@polybot/sdk";

// ── Signal: buy YES when market price < oracle price by > 3 cents ────

interface ArbSignal {
	edge: number;
}

const arbDetector: SignalDetector<unknown, ArbSignal> = {
	name: "simple-arb",

	detectEntry(ctx: DetectorContextLike): ArbSignal | null {
		const oracle = ctx.oraclePrice();
		const ask = ctx.bestAsk("yes");
		if (!oracle || !ask) return null;

		const edge = oracle.sub(ask).toNumber();
		if (edge < 0.03) return null;

		return { edge };
	},

	toOrder(_signal: ArbSignal, ctx: DetectorContextLike): SdkOrderIntent {
		const ask = ctx.bestAsk("yes");
		return {
			conditionId: ctx.conditionId,
			tokenId: marketTokenId("yes-token"),
			side: "yes",
			direction: "buy",
			price: ask ?? Decimal.from("0.50"),
			size: Decimal.from("10"),
		};
	},
};

// ── Build and run ────────────────────────────────────────────────────

const executor = new PaperExecutor({ fillProbability: 1, slippageBps: 5 });

const _strategy = StrategyBuilder.create().withDetector(arbDetector).withExecutor(executor).build();
