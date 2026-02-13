import { Decimal } from "../../shared/decimal.js";
import type { DetectorContextLike, ExitPolicy, ExitReason, PositionLike } from "../types.js";

/**
 * Exit policy that closes positions when losses exceed a threshold.
 * Limits downside risk by cutting losing positions early.
 *
 * @example
 * ```ts
 * const exit = StopLossExit.normal(); // 5% max loss
 * const reason = exit.shouldExit(position, ctx);
 * ```
 */
export class StopLossExit implements ExitPolicy {
	readonly name = "StopLoss";
	private readonly maxLoss: Decimal;

	private constructor(maxLoss: Decimal) {
		this.maxLoss = maxLoss;
	}

	/**
	 * Creates a stop-loss exit with a custom loss threshold.
	 * @param maxLoss Maximum loss threshold (e.g., 0.05 for 5%)
	 */
	static create(maxLoss: Decimal): StopLossExit {
		return new StopLossExit(maxLoss);
	}

	/**
	 * Creates a stop-loss exit from a percentage.
	 * @param pct Maximum loss as a percentage (e.g., 5 for 5%)
	 */
	static fromPct(pct: number): StopLossExit {
		return new StopLossExit(Decimal.from(pct / 100));
	}

	/** Creates a tight stop-loss exit with 3% max loss. */
	static tight(): StopLossExit {
		return StopLossExit.fromPct(3);
	}

	/** Creates a normal stop-loss exit with 5% max loss. */
	static normal(): StopLossExit {
		return StopLossExit.fromPct(5);
	}

	/** Creates a wide stop-loss exit with 10% max loss. */
	static wide(): StopLossExit {
		return StopLossExit.fromPct(10);
	}

	shouldExit(position: PositionLike, ctx: DetectorContextLike): ExitReason | null {
		const currentPrice = ctx.bestBid(position.side);
		if (currentPrice === null) return null;

		const costBasis = position.entryPrice.mul(position.size);
		if (costBasis.isZero()) return null;

		const roi = position.pnlTotal(currentPrice).div(costBasis);
		if (roi.lte(this.maxLoss.neg())) {
			return { type: "stop_loss", loss: roi.abs() };
		}
		return null;
	}
}
