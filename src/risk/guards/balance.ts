import type { Decimal } from "../../shared/decimal.js";
import type { EntryGuard, GuardContext, GuardVerdict } from "../types.js";
import { allow, blockWithValues } from "../types.js";

/**
 * Guard that blocks trades when available balance falls below a minimum threshold.
 * Prevents overtrading when funds are running low.
 *
 * @example
 * ```ts
 * const guard = BalanceGuard.create(Decimal.from("100")); // min $100 balance
 * const verdict = guard.check(ctx);
 * ```
 */
export class BalanceGuard implements EntryGuard {
	readonly name = "Balance";
	private readonly minBalance: Decimal;

	private constructor(minBalance: Decimal) {
		this.minBalance = minBalance;
	}

	/**
	 * Creates a guard with the specified minimum balance.
	 * @param minBalance - Minimum available balance required to trade
	 */
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
