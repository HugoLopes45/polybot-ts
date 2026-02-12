import { BookStalenessGuard } from "./guards/book-staleness.js";
import { CooldownGuard } from "./guards/cooldown.js";
import { ExposureGuard } from "./guards/exposure.js";
import { MaxPositionsGuard } from "./guards/max-positions.js";
import { MaxSpreadGuard } from "./guards/max-spread.js";
import type { EntryGuard, GuardContext, GuardVerdict } from "./types.js";
import { allow } from "./types.js";

/**
 * Guards execution pipeline that evaluates a sequence of risk guards.
 *
 * Guards are evaluated in order; the first guard to block stops execution.
 * Use presets like {@link GuardPipeline.standard} or compose custom pipelines
 * with {@link GuardPipeline.with}.
 *
 * @example
 * ```ts
 * const pipeline = GuardPipeline.standard()
 *   .with(MyCustomGuard.create());
 * const verdict = pipeline.evaluate(context);
 * ```
 */
export class GuardPipeline {
	private readonly guards: readonly EntryGuard[];

	private constructor(guards: readonly EntryGuard[]) {
		this.guards = guards;
	}

	/** Creates an empty pipeline with no guards. */
	static create(): GuardPipeline {
		return new GuardPipeline([]);
	}

	/**
	 * Appends a guard to the pipeline, returning a new pipeline instance.
	 * @param guard The guard to add
	 * @returns New pipeline with the guard appended
	 */
	with(guard: EntryGuard): GuardPipeline {
		return new GuardPipeline([...this.guards, guard]);
	}

	/**
	 * Evaluates all guards in sequence, returning the first block verdict or allow.
	 * @param ctx Guard context with market and risk data
	 * @returns GuardVerdict allowing or blocking the order
	 */
	evaluate(ctx: GuardContext): GuardVerdict {
		for (const guard of this.guards) {
			const verdict = guard.check(ctx);
			if (verdict.type === "block") return verdict;
		}
		return allow();
	}

	/** @returns True if no guards are configured */
	isEmpty(): boolean {
		return this.guards.length === 0;
	}

	/** @returns Number of guards in the pipeline */
	len(): number {
		return this.guards.length;
	}

	/** @returns Array of guard names in evaluation order */
	guardNames(): readonly string[] {
		return this.guards.map((g) => g.name);
	}

	/**
	 * Ensures at least one guard exists; returns minimal pipeline if empty.
	 * @returns Pipeline with guards, or minimal preset if empty
	 */
	requireGuards(): GuardPipeline {
		return this.isEmpty() ? GuardPipeline.minimal() : this;
	}

	// ── Presets ────────────────────────────────────────────────────

	/**
	 * Standard preset: balanced risk guards for normal trading.
	 * - MaxSpread: normal (0.5%)
	 * - MaxPositions: 5
	 * - Cooldown: normal
	 * - BookStaleness: 30s
	 */
	static standard(): GuardPipeline {
		return GuardPipeline.create()
			.with(MaxSpreadGuard.normal())
			.with(MaxPositionsGuard.create(5))
			.with(CooldownGuard.normal())
			.with(BookStalenessGuard.fromSecs(30));
	}

	/**
	 * Conservative preset: stricter limits for risk-averse strategies.
	 * - MaxSpread: tight (0.3%)
	 * - MaxPositions: 3
	 * - Exposure: conservative
	 * - Cooldown: long
	 * - BookStaleness: 15s
	 */
	static conservative(): GuardPipeline {
		return GuardPipeline.create()
			.with(MaxSpreadGuard.tight())
			.with(MaxPositionsGuard.create(3))
			.with(ExposureGuard.conservative())
			.with(CooldownGuard.long())
			.with(BookStalenessGuard.fromSecs(15));
	}

	/**
	 * Aggressive preset: relaxed limits for high-frequency strategies.
	 * - MaxSpread: wide (1.0%)
	 * - MaxPositions: 10
	 */
	static aggressive(): GuardPipeline {
		return GuardPipeline.create().with(MaxSpreadGuard.wide()).with(MaxPositionsGuard.create(10));
	}

	/**
	 * Minimal preset: only spread guard, for testing or custom configurations.
	 * - MaxSpread: wide (1.0%)
	 */
	static minimal(): GuardPipeline {
		return GuardPipeline.create().with(MaxSpreadGuard.wide());
	}
}
