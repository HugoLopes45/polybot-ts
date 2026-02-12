import type { EntryGuard, GuardContext, GuardVerdict } from "../types.js";
import { allow, block } from "../types.js";

export class ToxicityGuard implements EntryGuard {
	readonly name = "Toxicity";
	private readonly toxicMarkets: Set<string>;

	private constructor() {
		this.toxicMarkets = new Set();
	}

	static create(): ToxicityGuard {
		return new ToxicityGuard();
	}

	markToxic(conditionId: string): void {
		this.toxicMarkets.add(conditionId);
	}

	unmarkToxic(conditionId: string): void {
		this.toxicMarkets.delete(conditionId);
	}

	isToxic(conditionId: string): boolean {
		return this.toxicMarkets.has(conditionId);
	}

	check(ctx: GuardContext): GuardVerdict {
		const id = ctx.conditionId as string;
		if (this.toxicMarkets.has(id)) {
			return block(this.name, "market marked as toxic");
		}
		return allow();
	}
}
