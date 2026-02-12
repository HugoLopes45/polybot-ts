/**
 * Conservative Market Making — tight spreads, all safety guards.
 *
 * Uses the conservative preset with custom guards overlaid.
 * Demonstrates combining presets with additional configuration.
 * Run: npx tsx examples/conservative-mm.ts
 */

import {
	Decimal,
	type DetectorContextLike,
	MemoryJournal,
	PaperExecutor,
	type SdkOrderIntent,
	type SignalDetector,
	conservative,
	marketTokenId,
} from "../src/index.js";

// ── Market-making signal: place order at midpoint ───────────────────

interface MmSignal {
	mid: number;
	side: "yes" | "no";
}

const mmDetector: SignalDetector<unknown, MmSignal> = {
	name: "conservative-mm",

	detectEntry(ctx: DetectorContextLike): MmSignal | null {
		const bid = ctx.bestBid("yes");
		const ask = ctx.bestAsk("yes");
		if (!bid || !ask) return null;

		const sp = ask.sub(bid);
		if (sp.toNumber() < 0.02) return null; // skip tight spreads

		const mid = bid.add(ask).div(Decimal.from(2)).toNumber();
		return { mid, side: "yes" };
	},

	toOrder(signal: MmSignal, ctx: DetectorContextLike): SdkOrderIntent {
		return {
			conditionId: ctx.conditionId,
			tokenId: marketTokenId("yes-token"),
			side: signal.side,
			direction: "buy",
			price: Decimal.from(signal.mid.toFixed(4)),
			size: Decimal.from("5"), // small size for conservative
		};
	},
};

// ── Build with journal + events ─────────────────────────────────────

const journal = new MemoryJournal();
const executor = new PaperExecutor({ fillProbability: 1, slippageBps: 2 });

const _strategy = conservative()
	.withDetector(mmDetector)
	.withExecutor(executor)
	.withJournal(journal)
	.build();
