import type { EntryGuard, GuardContext, GuardVerdict } from "../types.js";
import { allow, blockWithValues } from "../types.js";

/**
 * Guard that limits portfolio drawdown to prevent excessive losses.
 * Blocks new orders when daily PNL drawdown exceeds the configured threshold.
 */
export class PortfolioRiskGuard implements EntryGuard {
	readonly name = "PortfolioRisk";
	private readonly maxDrawdownPct: number;

	private constructor(maxDrawdownPct: number) {
		this.maxDrawdownPct = maxDrawdownPct;
	}

	/**
	 * Creates a new PortfolioRiskGuard with the specified drawdown limit.
	 * @param maxDrawdownPct - Maximum drawdown as decimal (e.g., 0.1 for 10%)
	 * @example
	 * const guard = PortfolioRiskGuard.create(0.1); // 10% max drawdown
	 */
	static create(maxDrawdownPct: number): PortfolioRiskGuard {
		return new PortfolioRiskGuard(maxDrawdownPct);
	}

	/**
	 * Creates a guard from a percentage value.
	 * @param pct - The maximum drawdown percentage (e.g., 10 for 10%)
	 * @example
	 * const guard = PortfolioRiskGuard.fromPct(10); // 10% max drawdown
	 */
	static fromPct(pct: number): PortfolioRiskGuard {
		return new PortfolioRiskGuard(pct / 100);
	}

	check(ctx: GuardContext): GuardVerdict {
		const balance = ctx.availableBalance();
		if (balance.isZero()) return allow();

		const pnl = ctx.dailyPnl();
		if (pnl.isPositive() || pnl.isZero()) return allow();

		const ddPct = pnl.abs().div(balance).toNumber();
		if (ddPct >= this.maxDrawdownPct) {
			return blockWithValues(
				this.name,
				"portfolio drawdown limit",
				ddPct * 100,
				this.maxDrawdownPct * 100,
			);
		}
		return allow();
	}
}
