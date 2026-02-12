import { BookStalenessGuard } from "./guards/book-staleness.js";
import { CooldownGuard } from "./guards/cooldown.js";
import { ExposureGuard } from "./guards/exposure.js";
import { MaxPositionsGuard } from "./guards/max-positions.js";
import { MaxSpreadGuard } from "./guards/max-spread.js";
import type { EntryGuard, GuardContext, GuardVerdict } from "./types.js";
import { allow } from "./types.js";

export class GuardPipeline {
	private readonly guards: readonly EntryGuard[];

	private constructor(guards: readonly EntryGuard[]) {
		this.guards = guards;
	}

	static create(): GuardPipeline {
		return new GuardPipeline([]);
	}

	with(guard: EntryGuard): GuardPipeline {
		return new GuardPipeline([...this.guards, guard]);
	}

	evaluate(ctx: GuardContext): GuardVerdict {
		for (const guard of this.guards) {
			const verdict = guard.check(ctx);
			if (verdict.type === "block") return verdict;
		}
		return allow();
	}

	isEmpty(): boolean {
		return this.guards.length === 0;
	}

	len(): number {
		return this.guards.length;
	}

	guardNames(): readonly string[] {
		return this.guards.map((g) => g.name);
	}

	requireGuards(): GuardPipeline {
		return this.isEmpty() ? GuardPipeline.minimal() : this;
	}

	// ── Presets ────────────────────────────────────────────────────

	static standard(): GuardPipeline {
		return GuardPipeline.create()
			.with(MaxSpreadGuard.normal())
			.with(MaxPositionsGuard.create(5))
			.with(CooldownGuard.normal())
			.with(BookStalenessGuard.fromSecs(30));
	}

	static conservative(): GuardPipeline {
		return GuardPipeline.create()
			.with(MaxSpreadGuard.tight())
			.with(MaxPositionsGuard.create(3))
			.with(ExposureGuard.conservative())
			.with(CooldownGuard.long())
			.with(BookStalenessGuard.fromSecs(15));
	}

	static aggressive(): GuardPipeline {
		return GuardPipeline.create().with(MaxSpreadGuard.wide()).with(MaxPositionsGuard.create(10));
	}

	static minimal(): GuardPipeline {
		return GuardPipeline.create().with(MaxSpreadGuard.wide());
	}
}
