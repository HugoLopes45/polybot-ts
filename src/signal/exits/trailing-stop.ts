import { Decimal } from "../../shared/decimal.js";
import type { DetectorContextLike, ExitPolicy, ExitReason, PositionLike } from "../types.js";

export class TrailingStopExit implements ExitPolicy {
	readonly name = "TrailingStop";
	private readonly trailPct: Decimal;

	private constructor(trailPct: Decimal) {
		this.trailPct = trailPct;
	}

	static create(trailPct: Decimal): TrailingStopExit {
		return new TrailingStopExit(trailPct);
	}

	static fromPct(pct: number): TrailingStopExit {
		return new TrailingStopExit(Decimal.from(pct / 100));
	}

	static tight(): TrailingStopExit {
		return TrailingStopExit.fromPct(5);
	}

	static normal(): TrailingStopExit {
		return TrailingStopExit.fromPct(10);
	}

	static wide(): TrailingStopExit {
		return TrailingStopExit.fromPct(20);
	}

	shouldExit(position: PositionLike, ctx: DetectorContextLike): ExitReason | null {
		const currentPrice = ctx.bestBid(position.side);
		if (currentPrice === null) return null;

		const dd = position.drawdown(currentPrice);
		if (dd.gte(this.trailPct)) {
			return { type: "trailing_stop", drawdownPct: dd };
		}
		return null;
	}
}
