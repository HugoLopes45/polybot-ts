/**
 * CostBasis — immutable FIFO cost basis tracking.
 *
 * Tracks fills and computes weighted average entry price.
 * All mutations return new instances.
 */

import { Decimal } from "../shared/decimal.js";

/** A single fill event recording price, size, and timestamp. */
export interface FillRecord {
	readonly price: Decimal;
	readonly size: Decimal;
	readonly timestampMs: number;
}

/** Immutable FIFO cost basis tracker that computes weighted average entry price. */
export class CostBasis {
	private readonly fills: readonly FillRecord[];
	private readonly cost: Decimal;
	private readonly size: Decimal;

	private constructor(fills: readonly FillRecord[], cost: Decimal, size: Decimal) {
		this.fills = fills;
		this.cost = cost;
		this.size = size;
	}

	/**
	 * Creates an empty CostBasis with zero cost and size.
	 * @returns New empty CostBasis instance
	 */
	static create(): CostBasis {
		return new CostBasis([], Decimal.zero(), Decimal.zero());
	}

	/**
	 * Adds a fill record and returns a new CostBasis with updated cost and size.
	 * @param fill - The fill record to add
	 * @returns New CostBasis with the fill incorporated
	 * @example
	 * const updated = costBasis.addFill({ price: Decimal.from(100), size: Decimal.from(1), timestampMs: Date.now() });
	 */
	addFill(fill: FillRecord): CostBasis {
		const newCost = this.cost.add(fill.price.mul(fill.size));
		const newSize = this.size.add(fill.size);
		return new CostBasis([...this.fills, fill], newCost, newSize);
	}

	/** @returns Total cost (price × size for all fills) */
	totalCost(): Decimal {
		return this.cost;
	}

	/** @returns Total size across all fills */
	totalSize(): Decimal {
		return this.size;
	}

	/** @returns Number of fill records */
	fillCount(): number {
		return this.fills.length;
	}

	/**
	 * @returns Weighted average price (total cost / total size), or null if size is zero
	 * @example
	 * const avg = costBasis.weightedAvgPrice(); // Decimal or null
	 */
	weightedAvgPrice(): Decimal | null {
		if (this.size.isZero()) return null;
		return this.cost.div(this.size);
	}

	/** @returns Copy of all fill records */
	allFills(): readonly FillRecord[] {
		return this.fills;
	}
}
