/**
 * Fixed position sizer.
 *
 * Allocates a constant fraction of balance per trade.
 */

import { Decimal } from "../shared/decimal.js";
import { type Result, err, ok } from "../shared/result.js";
import type { PositionSizer, SizingInput, SizingResult } from "./types.js";

export class FixedSizer implements PositionSizer {
	readonly name = "Fixed";
	private readonly fraction: Decimal;

	private constructor(fraction: Decimal) {
		this.fraction = fraction;
	}

	static create(fractionPct: number): Result<FixedSizer, Error> {
		if (fractionPct <= 0) {
			return err(new Error("FixedSizer.create: fractionPct must be > 0"));
		}
		if (fractionPct > 100) {
			return err(new Error("FixedSizer.create: fractionPct must be <= 100"));
		}
		const fraction = Decimal.from(fractionPct).div(Decimal.from(100));
		return ok(new FixedSizer(fraction));
	}

	size(input: SizingInput): SizingResult {
		const maxPct = input.maxPositionPct ?? Decimal.from(0.25);
		const effectiveFraction = Decimal.min(this.fraction, maxPct);

		if (input.balance.isZero() || input.marketPrice.isZero()) {
			return {
				size: Decimal.zero(),
				fraction: effectiveFraction,
				method: "fixed",
			};
		}

		const allocation = input.balance.mul(effectiveFraction);
		const size = allocation.div(input.marketPrice);

		return {
			size,
			fraction: effectiveFraction,
			method: "fixed",
		};
	}
}
