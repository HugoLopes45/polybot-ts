import { Decimal } from "../../shared/decimal.js";
import type { EntryGuard, GuardContext, GuardVerdict } from "../types.js";
import { allow, blockWithValues } from "../types.js";

/**
 * Guard that blocks trades when VPIN (Volume-Synchronized Probability of Informed Trading)
 * indicates toxic order flow. High VPIN suggests informed traders are active, increasing
 * adverse selection risk.
 *
 * @example
 * ```ts
 * const guard = FlowRegimeGuard.create(() => vpin, Decimal.from(0.6));
 * ```
 */
export class FlowRegimeGuard implements EntryGuard {
	readonly name = "FlowRegime";
	private readonly getVpin: () => Decimal | null;
	private readonly threshold: Decimal;

	private constructor(getVpin: () => Decimal | null, threshold: Decimal) {
		this.getVpin = getVpin;
		this.threshold = threshold;
	}

	/**
	 * Creates a new FlowRegimeGuard.
	 * @param getVpin Function that returns current VPIN value (null if no data)
	 * @param threshold VPIN threshold above which trades are blocked (default: 0.7)
	 */
	static create(getVpin: () => Decimal | null, threshold?: Decimal): FlowRegimeGuard {
		const defaultThreshold = threshold ?? Decimal.from(0.7);
		return new FlowRegimeGuard(getVpin, defaultThreshold);
	}

	check(_ctx: GuardContext): GuardVerdict {
		const vpin = this.getVpin();

		if (vpin === null) {
			return blockWithValues(
				this.name,
				"VPIN data unavailable",
				0,
				this.threshold.toNumber() * 100,
			);
		}

		if (vpin.gt(this.threshold)) {
			return blockWithValues(
				this.name,
				"toxic flow detected",
				vpin.toNumber() * 100,
				this.threshold.toNumber() * 100,
			);
		}

		return allow();
	}
}
