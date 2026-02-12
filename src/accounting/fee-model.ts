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

export function noFees(): FeeModel {
	return { type: "none" };
}

export function fixedNotionalFee(bps: number): FeeModel {
	return { type: "fixed_notional", bps };
}

export function profitBasedFee(pct: number): FeeModel {
	return { type: "profit_based", pct };
}

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
