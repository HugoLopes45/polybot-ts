import type { EntryGuard, GuardContext, GuardVerdict } from "../types.js";
import { allow, blockWithValues } from "../types.js";

/**
 * Guard that limits the total number of open positions.
 * Blocks new orders when the position count reaches the configured maximum.
 */
export class MaxPositionsGuard implements EntryGuard {
	readonly name = "MaxPositions";
	private readonly maxPositions: number;

	private constructor(maxPositions: number) {
		this.maxPositions = maxPositions;
	}

	/**
	 * Creates a new MaxPositionsGuard with the specified position limit.
	 * @param maxPositions - Maximum number of open positions allowed
	 * @example
	 * const guard = MaxPositionsGuard.create(5);
	 */
	static create(maxPositions: number): MaxPositionsGuard {
		return new MaxPositionsGuard(maxPositions);
	}

	check(ctx: GuardContext): GuardVerdict {
		const count = ctx.openPositionCount();
		if (count >= this.maxPositions) {
			return blockWithValues(this.name, "max positions reached", count, this.maxPositions);
		}
		return allow();
	}
}
