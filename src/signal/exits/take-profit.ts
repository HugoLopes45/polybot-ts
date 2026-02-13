import { Decimal } from "../../shared/decimal.js";
import type { DetectorContextLike, ExitPolicy, ExitReason, PositionLike } from "../types.js";

/**
 * Exit policy that closes positions when return on investment reaches a target.
 * Locks in profits by selling once the position has gained enough.
 *
 * @example
 * ```ts
 * const exit = TakeProfitExit.normal(); // 10% ROI target
 * const reason = exit.shouldExit(position, ctx);
 * ```
 */
export class TakeProfitExit implements ExitPolicy {
	readonly name = "TakeProfit";
	private readonly targetRoi: Decimal;

	private constructor(targetRoi: Decimal) {
		this.targetRoi = targetRoi;
	}

	/**
	 * Creates a take-profit exit with a custom ROI target.
	 * @param targetRoi Return on investment threshold (e.g., 0.10 for 10%)
	 */
	static create(targetRoi: Decimal): TakeProfitExit {
		return new TakeProfitExit(targetRoi);
	}

	/**
	 * Creates a take-profit exit from a percentage.
	 * @param pct ROI threshold as a percentage (e.g., 10 for 10%)
	 */
	static fromPct(pct: number): TakeProfitExit {
		return new TakeProfitExit(Decimal.from(pct / 100));
	}

	/** Creates a small take-profit exit with 5% ROI target. */
	static small(): TakeProfitExit {
		return TakeProfitExit.fromPct(5);
	}

	/** Creates a normal take-profit exit with 10% ROI target. */
	static normal(): TakeProfitExit {
		return TakeProfitExit.fromPct(10);
	}

	/** Creates a large take-profit exit with 20% ROI target. */
	static large(): TakeProfitExit {
		return TakeProfitExit.fromPct(20);
	}

	shouldExit(position: PositionLike, ctx: DetectorContextLike): ExitReason | null {
		const currentPrice = ctx.bestBid(position.side);
		if (currentPrice === null) return null;

		const costBasis = position.entryPrice.mul(position.size);
		if (costBasis.isZero()) return null;

		const roi = position.pnlTotal(currentPrice).div(costBasis);
		if (roi.gte(this.targetRoi)) {
			return { type: "take_profit", roi };
		}
		return null;
	}
}
