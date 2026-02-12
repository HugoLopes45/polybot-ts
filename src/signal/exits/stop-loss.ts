import { Decimal } from "../../shared/decimal.js";
import type { DetectorContextLike, ExitPolicy, ExitReason, PositionLike } from "../types.js";

export class StopLossExit implements ExitPolicy {
	readonly name = "StopLoss";
	private readonly maxLoss: Decimal;

	private constructor(maxLoss: Decimal) {
		this.maxLoss = maxLoss;
	}

	static create(maxLoss: Decimal): StopLossExit {
		return new StopLossExit(maxLoss);
	}

	static fromPct(pct: number): StopLossExit {
		return new StopLossExit(Decimal.from(pct / 100));
	}

	static tight(): StopLossExit {
		return StopLossExit.fromPct(3);
	}

	static normal(): StopLossExit {
		return StopLossExit.fromPct(5);
	}

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
