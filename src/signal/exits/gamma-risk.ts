import type { DetectorContextLike, ExitPolicy, ExitReason, PositionLike } from "../types.js";

/**
 * Configuration for gamma risk exit policy.
 */
export interface GammaRiskConfig {
	/** Minimum time remaining in ms before gamma risk triggers (default: 300_000). */
	readonly minTimeRemainingMs?: number;
}

/**
 * Exit policy that closes positions when gamma risk is high.
 * For binary options near expiry, gamma explodes when spot approaches 0.5,
 * creating extreme price sensitivity and adverse execution risk.
 *
 * @example
 * ```ts
 * const exit = GammaRiskExit.create({ minTimeRemainingMs: 300_000 });
 * const reason = exit.shouldExit(position, ctx);
 * ```
 */
export class GammaRiskExit implements ExitPolicy {
	readonly name = "GammaRisk";
	private readonly minTimeRemainingMs: number;

	private constructor(minTimeRemainingMs: number) {
		this.minTimeRemainingMs = minTimeRemainingMs;
	}

	/**
	 * Creates a new GammaRiskExit.
	 * @param config Optional configuration (defaults: minTimeRemainingMs=300_000)
	 */
	static create(config?: GammaRiskConfig): GammaRiskExit {
		return new GammaRiskExit(config?.minTimeRemainingMs ?? 300_000);
	}

	shouldExit(_position: PositionLike, ctx: DetectorContextLike): ExitReason | null {
		const timeRemainingMs = ctx.timeRemainingMs();
		const spot = ctx.spot();

		if (spot === null) {
			if (timeRemainingMs < this.minTimeRemainingMs) {
				return { type: "emergency", reason: "gamma risk: no spot data near expiry" };
			}
			return null;
		}

		const spotValue = spot.toNumber();
		if (timeRemainingMs < this.minTimeRemainingMs && spotValue >= 0.3 && spotValue <= 0.7) {
			return { type: "emergency", reason: "gamma risk: spot near 0.5 at expiry" };
		}

		return null;
	}
}
