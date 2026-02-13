/**
 * FeeModel — discriminated union for fee calculation.
 *
 * Three variants: None, FixedNotional, ProfitBased.
 * All fee computations are pure functions returning Decimal.
 */

import { Decimal } from "../shared/decimal.js";

export type FeeModel =
	| { readonly type: "none" }
	| { readonly type: "fixed_notional"; readonly bps: number }
	| { readonly type: "profit_based"; readonly pct: number };

/** Creates a fee model that charges no fees. */
export function noFees(): FeeModel {
	return { type: "none" };
}

/**
 * Creates a fee model charging a fixed percentage of trade notional value.
 * @param bps - Fee in basis points (1 bps = 0.01%)
 */
export function fixedNotionalFee(bps: number): FeeModel {
	return { type: "fixed_notional", bps };
}

/**
 * Creates a fee model charging a percentage of realized profit only.
 * No fee is charged on losing trades.
 * @param pct - Fee percentage (e.g. 20 for 20% of profit)
 */
export function profitBasedFee(pct: number): FeeModel {
	return { type: "profit_based", pct };
}

/**
 * Computes the fee for a trade based on the fee model.
 * @param model - The fee model to use
 * @param notional - Total notional value of the trade
 * @param pnl - Realized profit/loss of the trade
 * @returns Fee amount as a Decimal (always non-negative)
 */
export function computeFee(model: FeeModel, notional: Decimal, pnl: Decimal): Decimal {
	switch (model.type) {
		case "none":
			return Decimal.zero();
		case "fixed_notional":
			return notional.mul(Decimal.from(model.bps / 10_000));
		case "profit_based": {
			if (pnl.isNegative() || pnl.isZero()) return Decimal.zero();
			return pnl.mul(Decimal.from(model.pct / 100));
		}
	}
}
