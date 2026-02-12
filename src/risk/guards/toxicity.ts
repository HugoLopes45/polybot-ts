import type { EntryGuard, GuardContext, GuardVerdict } from "../types.js";
import { allow, block } from "../types.js";

/**
 * Guard that blocks trades on markets marked as toxic.
 * Allows manual curation of markets that should be avoided due to
 * unfavorable conditions, manipulation, or other risk factors.
 *
 * @example
 * ```ts
 * const guard = ToxicityGuard.create();
 * guard.markToxic("condition-123");
 * const verdict = guard.check(ctx);
 * ```
 */
export class ToxicityGuard implements EntryGuard {
	readonly name = "Toxicity";
	private readonly toxicMarkets: Set<string>;

	private constructor() {
		this.toxicMarkets = new Set();
	}

	/**
	 * Creates a new ToxicityGuard with an empty toxic markets list.
	 */
	static create(): ToxicityGuard {
		return new ToxicityGuard();
	}

	/**
	 * Marks a market as toxic, blocking all trades on that condition.
	 * @param conditionId - The condition ID to mark as toxic
	 */
	markToxic(conditionId: string): void {
		this.toxicMarkets.add(conditionId);
	}

	/**
	 * Removes the toxic mark from a market, allowing trades again.
	 * @param conditionId - The condition ID to unmark
	 */
	unmarkToxic(conditionId: string): void {
		this.toxicMarkets.delete(conditionId);
	}

	/**
	 * @param conditionId - The condition ID to check
	 * @returns Whether the market is currently marked as toxic
	 */
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
