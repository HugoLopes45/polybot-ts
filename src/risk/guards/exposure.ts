import type { EntryGuard, GuardContext, GuardVerdict } from "../types.js";
import { allow, blockWithValues } from "../types.js";

export class ExposureGuard implements EntryGuard {
	readonly name = "Exposure";
	private readonly maxExposurePct: number;

	private constructor(maxExposurePct: number) {
		this.maxExposurePct = maxExposurePct;
	}

	static create(maxExposurePct: number): ExposureGuard {
		return new ExposureGuard(maxExposurePct);
	}

	static fromPct(pct: number): ExposureGuard {
		return new ExposureGuard(pct / 100);
	}

	static conservative(): ExposureGuard {
		return ExposureGuard.fromPct(25);
	}

	static normal(): ExposureGuard {
		return ExposureGuard.fromPct(50);
	}

	static aggressive(): ExposureGuard {
		return ExposureGuard.fromPct(75);
	}

	check(ctx: GuardContext): GuardVerdict {
		const balance = ctx.availableBalance();
		if (balance.isZero()) return allow();

		const exposure = ctx.totalExposure();
		const ratioPct = exposure.div(balance).toNumber();
		if (ratioPct >= this.maxExposurePct) {
			return blockWithValues(
				this.name,
				"exposure limit reached",
				ratioPct * 100,
				this.maxExposurePct * 100,
			);
		}
		return allow();
	}
}
