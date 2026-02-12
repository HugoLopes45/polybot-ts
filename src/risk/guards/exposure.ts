import type { EntryGuard, GuardContext, GuardVerdict } from "../types.js";
import { allow, blockWithValues } from "../types.js";

/**
 * Guard that limits total exposure as a percentage of available balance.
 * Prevents over-concentration of capital in open positions.
 *
 * @example
 * ```ts
 * const guard = ExposureGuard.fromPct(50); // 50% of balance
 * const verdict = guard.check(ctx);
 * ```
 */
export class ExposureGuard implements EntryGuard {
	readonly name = "Exposure";
	private readonly maxExposurePct: number;

	private constructor(maxExposurePct: number) {
		this.maxExposurePct = maxExposurePct;
	}

	/**
	 * Creates a guard with the specified maximum exposure ratio.
	 * @param maxExposurePct - Maximum exposure as a ratio (e.g., 0.5 for 50%)
	 */
	static create(maxExposurePct: number): ExposureGuard {
		return new ExposureGuard(maxExposurePct);
	}

	/**
	 * Creates a guard with the specified maximum exposure percentage.
	 * @param pct - Maximum exposure as percentage (e.g., 50 for 50%)
	 */
	static fromPct(pct: number): ExposureGuard {
		return new ExposureGuard(pct / 100);
	}

	/**
	 * Creates a conservative guard with 25% maximum exposure.
	 */
	static conservative(): ExposureGuard {
		return ExposureGuard.fromPct(25);
	}

	/**
	 * Creates a guard with normal 50% maximum exposure.
	 */
	static normal(): ExposureGuard {
		return ExposureGuard.fromPct(50);
	}

	/**
	 * Creates an aggressive guard with 75% maximum exposure.
	 */
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
