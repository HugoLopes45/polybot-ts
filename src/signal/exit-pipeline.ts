/**
 * ExitPipeline — composable exit policy evaluation.
 *
 * OR semantics: first policy that triggers wins. Immutable builder
 * pattern — .with() returns a new pipeline, leaving the original unchanged.
 */

import { NearExpiryExit } from "./exits/near-expiry.js";
import { StopLossExit } from "./exits/stop-loss.js";
import { TakeProfitExit } from "./exits/take-profit.js";
import { TimeExit } from "./exits/time-exit.js";
import { TrailingStopExit } from "./exits/trailing-stop.js";
import type { DetectorContextLike, ExitPolicy, ExitReason, PositionLike } from "./types.js";

export class ExitPipeline {
	private readonly policies: readonly ExitPolicy[];

	private constructor(policies: readonly ExitPolicy[]) {
		this.policies = policies;
	}

	static create(): ExitPipeline {
		return new ExitPipeline([]);
	}

	with(policy: ExitPolicy): ExitPipeline {
		return new ExitPipeline([...this.policies, policy]);
	}

	evaluate(position: PositionLike, ctx: DetectorContextLike): ExitReason | null {
		for (const policy of this.policies) {
			const reason = policy.shouldExit(position, ctx);
			if (reason !== null) return reason;
		}
		return null;
	}

	isEmpty(): boolean {
		return this.policies.length === 0;
	}

	len(): number {
		return this.policies.length;
	}

	policyNames(): readonly string[] {
		return this.policies.map((p) => p.name);
	}

	requireExits(): ExitPipeline {
		return this.isEmpty() ? ExitPipeline.minimal() : this;
	}

	// ── Presets ────────────────────────────────────────────────────

	static standard(): ExitPipeline {
		return ExitPipeline.create()
			.with(TakeProfitExit.normal())
			.with(StopLossExit.normal())
			.with(TrailingStopExit.normal())
			.with(TimeExit.normal());
	}

	static conservative(): ExitPipeline {
		return ExitPipeline.create()
			.with(TakeProfitExit.small())
			.with(StopLossExit.tight())
			.with(TrailingStopExit.tight())
			.with(TimeExit.long())
			.with(NearExpiryExit.long());
	}

	static aggressive(): ExitPipeline {
		return ExitPipeline.create()
			.with(TakeProfitExit.large())
			.with(StopLossExit.wide())
			.with(TrailingStopExit.wide());
	}

	static minimal(): ExitPipeline {
		return ExitPipeline.create().with(StopLossExit.wide()).with(TimeExit.short());
	}
}
