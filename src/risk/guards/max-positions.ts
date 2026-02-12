import type { EntryGuard, GuardContext, GuardVerdict } from "../types.js";
import { allow, blockWithValues } from "../types.js";

export class MaxPositionsGuard implements EntryGuard {
	readonly name = "MaxPositions";
	private readonly maxPositions: number;

	private constructor(maxPositions: number) {
		this.maxPositions = maxPositions;
	}

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
