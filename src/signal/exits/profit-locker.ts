import { Decimal } from "../../shared/decimal.js";
import type { DetectorContextLike, ExitPolicy, ExitReason, PositionLike } from "../types.js";

/**
 * Exit policy that implements a trailing stop on cumulative P&L.
 * Tracks the profit high-water mark and exits when drawdown from peak exceeds threshold.
 * Only activates once profit becomes positive, protecting against giving back gains.
 *
 * @example
 * ```ts
 * const exit = ProfitLockerExit.create(Decimal.from(0.15)); // 15% trailing stop
 * exit.updatePnl(currentPnl); // Call each tick
 * const reason = exit.shouldExit(position, ctx);
 * ```
 */
export class ProfitLockerExit implements ExitPolicy {
	readonly name = "ProfitLocker";
	private readonly drawdownThreshold: Decimal;
	private hwm: Decimal;
	private currentPnl: Decimal;

	private constructor(drawdownThreshold: Decimal) {
		this.drawdownThreshold = drawdownThreshold;
		this.hwm = Decimal.zero();
		this.currentPnl = Decimal.zero();
	}

	/**
	 * Creates a new ProfitLockerExit with the specified drawdown threshold.
	 * @param drawdownThreshold Maximum drawdown from peak as a decimal (e.g., 0.15 for 15%)
	 */
	static create(drawdownThreshold: Decimal): ProfitLockerExit {
		return new ProfitLockerExit(drawdownThreshold);
	}

	/**
	 * Updates the profit high-water mark. Call this each tick with current cumulative P&L.
	 * @param pnl Current cumulative profit/loss
	 */
	updatePnl(pnl: Decimal): void {
		this.currentPnl = pnl;
		this.hwm = Decimal.max(this.hwm, pnl);
	}

	shouldExit(_position: PositionLike, _ctx: DetectorContextLike): ExitReason | null {
		if (this.hwm.lte(Decimal.zero())) {
			return null;
		}

		const drawdown = this.hwm.sub(this.currentPnl).div(this.hwm);

		if (drawdown.gte(this.drawdownThreshold)) {
			return { type: "trailing_stop", drawdownPct: drawdown };
		}

		return null;
	}
}
