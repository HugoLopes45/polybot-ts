/**
 * CostBasis — immutable FIFO cost basis tracking.
 *
 * Tracks fills and computes weighted average entry price.
 * All mutations return new instances.
 */

import { Decimal } from "../shared/decimal.js";

export interface FillRecord {
	readonly price: Decimal;
	readonly size: Decimal;
	readonly timestampMs: number;
}

export class CostBasis {
	private readonly fills: readonly FillRecord[];
	private readonly cost: Decimal;
	private readonly size: Decimal;

	private constructor(fills: readonly FillRecord[], cost: Decimal, size: Decimal) {
		this.fills = fills;
		this.cost = cost;
		this.size = size;
	}

	static create(): CostBasis {
		return new CostBasis([], Decimal.zero(), Decimal.zero());
	}

	addFill(fill: FillRecord): CostBasis {
		const newCost = this.cost.add(fill.price.mul(fill.size));
		const newSize = this.size.add(fill.size);
		return new CostBasis([...this.fills, fill], newCost, newSize);
	}

	totalCost(): Decimal {
		return this.cost;
	}

	totalSize(): Decimal {
		return this.size;
	}

	fillCount(): number {
		return this.fills.length;
	}

	weightedAvgPrice(): Decimal | null {
		if (this.size.isZero()) return null;
		return this.cost.div(this.size);
	}

	allFills(): readonly FillRecord[] {
		return this.fills;
	}
}
