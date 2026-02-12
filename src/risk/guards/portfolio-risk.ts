import type { EntryGuard, GuardContext, GuardVerdict } from "../types.js";
import { allow, blockWithValues } from "../types.js";

export class PortfolioRiskGuard implements EntryGuard {
	readonly name = "PortfolioRisk";
	private readonly maxDrawdownPct: number;

	private constructor(maxDrawdownPct: number) {
		this.maxDrawdownPct = maxDrawdownPct;
	}

	static create(maxDrawdownPct: number): PortfolioRiskGuard {
		return new PortfolioRiskGuard(maxDrawdownPct);
	}

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
