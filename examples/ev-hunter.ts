/**
 * EV Hunter — enters when expected value exceeds threshold.
 *
 * Compares oracle price to market price, accounting for fees.
 * Uses the evHunter preset which includes standard guards and exits.
 * Run: npx tsx examples/ev-hunter.ts
 */

import {
	Decimal,
	type DetectorContextLike,
	PaperExecutor,
	type SdkOrderIntent,
	type SignalDetector,
	evHunter,
	marketTokenId,
} from "@polybot/sdk";

// ── EV signal detector ──────────────────────────────────────────────

interface EvSignal {
	ev: number;
	side: "yes" | "no";
}

const FEE_BPS = 15;

const evDetector: SignalDetector<unknown, EvSignal> = {
	name: "ev-hunter",

	detectEntry(ctx: DetectorContextLike): EvSignal | null {
		const oracle = ctx.oraclePrice();
		if (!oracle) return null;

		const yesAsk = ctx.bestAsk("yes");
		const noAsk = ctx.bestAsk("no");
		if (!yesAsk || !noAsk) return null;

		const feeMul = 1 - FEE_BPS / 10_000;

		// EV(yes) = oracle * (1/ask) * feeMul - 1
		const yesEv = oracle.toNumber() * (1 / yesAsk.toNumber()) * feeMul - 1;
		// EV(no) = (1-oracle) * (1/ask) * feeMul - 1
		const noEv = (1 - oracle.toNumber()) * (1 / noAsk.toNumber()) * feeMul - 1;

		if (yesEv > 0.05) return { ev: yesEv, side: "yes" };
		if (noEv > 0.05) return { ev: noEv, side: "no" };
		return null;
	},

	toOrder(signal: EvSignal, ctx: DetectorContextLike): SdkOrderIntent {
		const ask = ctx.bestAsk(signal.side);
		return {
			conditionId: ctx.conditionId,
			tokenId: marketTokenId(`${signal.side}-token`),
			side: signal.side,
			direction: "buy",
			price: ask ?? Decimal.from("0.50"),
			size: Decimal.from("25"),
		};
	},
};

// ── Build using preset ──────────────────────────────────────────────

const executor = new PaperExecutor({ fillProbability: 0.95 });

const _strategy = evHunter().withDetector(evDetector).withExecutor(executor).build();
