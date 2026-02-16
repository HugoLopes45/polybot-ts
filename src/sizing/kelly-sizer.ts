/**
 * Kelly Criterion position sizer.
 *
 * Edge-based sizing using Kelly criterion.
 * Full Kelly: f* = edge / odds where odds = (1 - marketPrice) / marketPrice
 * Supports fractional Kelly (half, quarter) for more conservative sizing.
 */

import { Decimal } from "../shared/decimal.js";
import { type Result, err, ok } from "../shared/result.js";
import type { PositionSizer, SizingInput, SizingMethod, SizingResult } from "./types.js";

export class KellySizer implements PositionSizer {
	readonly name: string;
	private readonly kellyFraction: Decimal;
	private readonly method: SizingMethod;

	private constructor(kellyFraction: Decimal, name: string, method: SizingMethod) {
		this.kellyFraction = kellyFraction;
		this.name = name;
		this.method = method;
	}

	static full(): KellySizer {
		return new KellySizer(Decimal.one(), "Kelly", "kelly");
	}

	static half(): KellySizer {
		return new KellySizer(Decimal.from(0.5), "HalfKelly", "half_kelly");
	}

	static quarter(): KellySizer {
		return new KellySizer(Decimal.from(0.25), "QuarterKelly", "quarter_kelly");
	}

	static create(fraction: number): Result<KellySizer, Error> {
		if (fraction <= 0) {
			return err(new Error("KellySizer.create: fraction must be > 0"));
		}
		if (fraction > 1) {
			return err(new Error("KellySizer.create: fraction must be <= 1"));
		}
		const f = Decimal.from(fraction);
		return ok(new KellySizer(f, `Kelly(${fraction})`, "custom_kelly"));
	}

	size(input: SizingInput): SizingResult {
		const maxPct = input.maxPositionPct ?? Decimal.from(0.25);

		if (
			input.balance.isZero() ||
			input.marketPrice.isZero() ||
			input.marketPrice.gte(Decimal.one())
		) {
			return { size: Decimal.zero(), fraction: Decimal.zero(), method: this.method };
		}

		if (input.edge.isNegative() || input.edge.isZero()) {
			return { size: Decimal.zero(), fraction: Decimal.zero(), method: this.method };
		}

		const oneMinusPrice = Decimal.one().sub(input.marketPrice);
		const odds = oneMinusPrice.div(input.marketPrice);
		const kellyFull = input.edge.div(odds);

		let f = kellyFull.mul(this.kellyFraction);
		if (f.isNegative()) {
			f = Decimal.zero();
		}
		if (f.gt(maxPct)) {
			f = maxPct;
		}

		const allocation = input.balance.mul(f);
		const size = allocation.div(input.marketPrice);

		return { size, fraction: f, method: this.method };
	}
}
