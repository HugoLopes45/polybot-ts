import { Decimal } from "../../shared/decimal.js";
import type { DetectorContextLike, ExitPolicy, ExitReason, PositionLike } from "../types.js";

export class TakeProfitExit implements ExitPolicy {
	readonly name = "TakeProfit";
	private readonly targetRoi: Decimal;

	private constructor(targetRoi: Decimal) {
		this.targetRoi = targetRoi;
	}

	static create(targetRoi: Decimal): TakeProfitExit {
		return new TakeProfitExit(targetRoi);
	}

	static fromPct(pct: number): TakeProfitExit {
		return new TakeProfitExit(Decimal.from(pct / 100));
	}

	static small(): TakeProfitExit {
		return TakeProfitExit.fromPct(5);
	}

	static normal(): TakeProfitExit {
		return TakeProfitExit.fromPct(10);
	}

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
