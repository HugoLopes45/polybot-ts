/**
 * Scanner Strategy — scans multiple markets for edge, trades the best one.
 *
 * Demonstrates the market scanner and how to feed results into a detector.
 *
 * NOTE: This is a setup example demonstrating scanner/detector wiring.
 * It requires a WebSocket feed and market context to actually run ticks.
 *
 * Run: npx tsx examples/scanner-strategy.ts
 */

import {
	Decimal,
	type DetectorContextLike,
	type MarketInfo,
	type OrderbookSnapshot,
	PaperExecutor,
	type SdkOrderIntent,
	type SignalDetector,
	StrategyBuilder,
	marketTokenId,
	scan,
} from "@polybot/sdk";

// ── Scanner: find markets with best edge/spread ratio ───────────────

const MIN_SCORE = 0.5;

export function findBestMarket(
	markets: readonly MarketInfo[],
	books: ReadonlyMap<string, OrderbookSnapshot>,
): { conditionId: string; edge: number; score: number } | null {
	const results = scan(markets, books);
	const best = results[0];
	if (!best || best.score < MIN_SCORE) return null;

	return {
		conditionId: best.conditionId as string,
		edge: best.edge.toNumber(),
		score: best.score,
	};
}

// ── Detector: trades selected market ────────────────────────────────

interface ScanSignal {
	edge: number;
	score: number;
}

const scanDetector: SignalDetector<unknown, ScanSignal> = {
	name: "scanner",

	detectEntry(ctx: DetectorContextLike): ScanSignal | null {
		const oracle = ctx.oraclePrice();
		const ask = ctx.bestAsk("yes");
		if (!oracle || !ask) return null;

		const edge = oracle.sub(ask).abs().toNumber();
		if (edge < 0.02) return null;

		return { edge, score: edge * 100 };
	},

	toOrder(_signal: ScanSignal, ctx: DetectorContextLike): SdkOrderIntent {
		const ask = ctx.bestAsk("yes");
		return {
			conditionId: ctx.conditionId,
			tokenId: marketTokenId("yes-token"),
			side: "yes",
			direction: "buy",
			price: ask ?? Decimal.from("0.50"),
			size: Decimal.from("15"),
		};
	},
};

// ── Build ────────────────────────────────────────────────────────────

const executor = new PaperExecutor({ fillProbability: 0.9, slippageBps: 10 });

const _strategy = StrategyBuilder.create()
	.withDetector(scanDetector)
	.withExecutor(executor)
	.build();
