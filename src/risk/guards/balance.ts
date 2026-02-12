import type { Decimal } from "../../shared/decimal.js";
import type { EntryGuard, GuardContext, GuardVerdict } from "../types.js";
import { allow, blockWithValues } from "../types.js";

export class BalanceGuard implements EntryGuard {
	readonly name = "Balance";
	private readonly minBalance: Decimal;

	private constructor(minBalance: Decimal) {
		this.minBalance = minBalance;
	}

	static create(minBalance: Decimal): BalanceGuard {
		return new BalanceGuard(minBalance);
	}

	check(ctx: GuardContext): GuardVerdict {
		const balance = ctx.availableBalance();
		if (balance.lt(this.minBalance)) {
			return blockWithValues(
				this.name,
				"insufficient balance",
				balance.toNumber(),
				this.minBalance.toNumber(),
			);
		}
		return allow();
	}
}
