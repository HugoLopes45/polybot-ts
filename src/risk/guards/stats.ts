import type { EntryGuard, GuardContext, GuardVerdict } from "../types.js";
import { allow, blockWithValues } from "../types.js";

/**
 * Snapshot of trading performance statistics.
 */
export interface StatsSnapshot {
	readonly drawdownPct: number;
	readonly consecutiveLosses: number;
	readonly winRate: number;
	readonly tradeCount: number;
}

/**
 * Configuration for StatsGuard thresholds.
 */
export interface StatsGuardConfig {
	readonly maxDrawdownPct?: number;
	readonly maxConsecutiveLosses?: number;
	readonly minWinRate?: number;
	readonly minTradesForWinRate?: number;
}

/**
 * Guard that blocks trades when trading statistics indicate poor performance.
 * Checks drawdown, consecutive losses, and win rate against configurable thresholds.
 *
 * @example
 * ```ts
 * const guard = StatsGuard.create(() => statsSnapshot, {
 *   maxDrawdownPct: 0.15,
 *   maxConsecutiveLosses: 3,
 *   minWinRate: 0.45
 * });
 * ```
 */
export class StatsGuard implements EntryGuard {
	readonly name = "Stats";
	private readonly getStats: () => StatsSnapshot;
	private readonly maxDrawdownPct: number;
	private readonly maxConsecutiveLosses: number;
	private readonly minWinRate: number;
	private readonly minTradesForWinRate: number;

	private constructor(getStats: () => StatsSnapshot, config: Required<StatsGuardConfig>) {
		this.getStats = getStats;
		this.maxDrawdownPct = config.maxDrawdownPct;
		this.maxConsecutiveLosses = config.maxConsecutiveLosses;
		this.minWinRate = config.minWinRate;
		this.minTradesForWinRate = config.minTradesForWinRate;
	}

	/**
	 * Creates a new StatsGuard with the provided statistics supplier and optional configuration.
	 * @param getStats Function that returns the current trading statistics
	 * @param config Optional configuration for thresholds (defaults: 20% drawdown, 5 consecutive losses, 40% win rate, 20 min trades)
	 */
	static create(getStats: () => StatsSnapshot, config?: StatsGuardConfig): StatsGuard {
		const fullConfig: Required<StatsGuardConfig> = {
			maxDrawdownPct: config?.maxDrawdownPct ?? 0.2,
			maxConsecutiveLosses: config?.maxConsecutiveLosses ?? 5,
			minWinRate: config?.minWinRate ?? 0.4,
			minTradesForWinRate: config?.minTradesForWinRate ?? 20,
		};
		return new StatsGuard(getStats, fullConfig);
	}

	check(_ctx: GuardContext): GuardVerdict {
		const stats = this.getStats();

		if (stats.drawdownPct > this.maxDrawdownPct) {
			return blockWithValues(
				this.name,
				"drawdown exceeded",
				stats.drawdownPct * 100,
				this.maxDrawdownPct * 100,
			);
		}

		if (stats.consecutiveLosses > this.maxConsecutiveLosses) {
			return blockWithValues(
				this.name,
				"consecutive losses exceeded",
				stats.consecutiveLosses,
				this.maxConsecutiveLosses,
			);
		}

		if (stats.tradeCount >= this.minTradesForWinRate && stats.winRate < this.minWinRate) {
			return blockWithValues(
				this.name,
				"win rate below threshold",
				stats.winRate * 100,
				this.minWinRate * 100,
			);
		}

		return allow();
	}
}
