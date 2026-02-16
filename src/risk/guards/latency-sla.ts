import type { EntryGuard, GuardContext, GuardVerdict } from "../types.js";
import { allow, blockWithValues } from "../types.js";

/**
 * Latency percentile statistics for system performance monitoring.
 */
export interface LatencyStats {
	readonly p50Ms: number;
	readonly p95Ms: number;
	readonly p99Ms: number;
}

/**
 * Guard that blocks trades when latency exceeds SLA thresholds.
 * Prevents trading when system performance degrades beyond acceptable levels.
 *
 * @example
 * ```ts
 * const guard = LatencySlaGuard.create(() => latencyStats, {
 *   maxP95Ms: 300,
 *   maxP99Ms: 800
 * });
 * ```
 */
export class LatencySlaGuard implements EntryGuard {
	readonly name = "LatencySla";
	private readonly getLatency: () => LatencyStats;
	private readonly maxP95Ms: number;
	private readonly maxP99Ms: number;

	private constructor(
		getLatency: () => LatencyStats,
		config: { maxP95Ms: number; maxP99Ms: number },
	) {
		this.getLatency = getLatency;
		this.maxP95Ms = config.maxP95Ms;
		this.maxP99Ms = config.maxP99Ms;
	}

	/**
	 * Creates a new LatencySlaGuard.
	 * @param getLatency Function that returns current latency statistics
	 * @param config Optional SLA thresholds (defaults: p95=500ms, p99=1000ms)
	 */
	static create(
		getLatency: () => LatencyStats,
		config?: { maxP95Ms?: number; maxP99Ms?: number },
	): LatencySlaGuard {
		const fullConfig = {
			maxP95Ms: config?.maxP95Ms ?? 500,
			maxP99Ms: config?.maxP99Ms ?? 1000,
		};
		return new LatencySlaGuard(getLatency, fullConfig);
	}

	check(_ctx: GuardContext): GuardVerdict {
		const stats = this.getLatency();

		if (stats.p95Ms > this.maxP95Ms) {
			return blockWithValues(this.name, "p95 latency exceeded SLA", stats.p95Ms, this.maxP95Ms);
		}

		if (stats.p99Ms > this.maxP99Ms) {
			return blockWithValues(this.name, "p99 latency exceeded SLA", stats.p99Ms, this.maxP99Ms);
		}

		return allow();
	}
}
