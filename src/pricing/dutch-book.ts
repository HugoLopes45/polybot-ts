/**
 * Dutch Book Escape Route — exploit YES+NO=$1 invariant to recover from trapped positions.
 *
 * When a prediction market position goes underwater, there are two exit paths:
 * - **Front door**: Sell at current bid (immediate loss, recover partial capital)
 * - **Back door**: Buy opposite side at ask, creating a YES+NO pair worth $1 at settlement
 *
 * This module compares both paths and recommends the best recovery strategy.
 */
import { Decimal } from "../shared/decimal.js";

export type EscapeVerdict = "front_door" | "back_door" | "trapped";

export interface EscapeRoute {
	readonly verdict: EscapeVerdict;
	/** Recovery amount per token (how much you get back). */
	readonly recovery: Decimal;
	/** Cost of the hedge (only for back_door). */
	readonly hedgeCost: Decimal;
	/** Net P&L of the escape (always negative or zero for a trapped position). */
	readonly netPnl: Decimal;
}

/**
 * Calculate the best escape route from a trapped binary position.
 *
 * @param side - "yes" or "no" — which side the position holds
 * @param entryPrice - Price paid per token
 * @param size - Number of tokens held
 * @param yesBid - Current best bid for YES tokens
 * @param yesAsk - Current best ask for YES tokens
 * @param noBid - Current best bid for NO tokens
 * @param noAsk - Current best ask for NO tokens
 * @param minRecoveryPct - Minimum recovery % to not be considered trapped (default 0.10 = 10%)
 */
export function calculateEscapeRoute(
	side: "yes" | "no",
	entryPrice: Decimal,
	size: Decimal,
	yesBid: Decimal,
	yesAsk: Decimal,
	noBid: Decimal,
	noAsk: Decimal,
	minRecoveryPct: Decimal = Decimal.from("0.10"),
): EscapeRoute {
	const one = Decimal.one();
	const zero = Decimal.zero();

	if (size.isZero()) {
		return {
			verdict: "trapped",
			recovery: zero,
			hedgeCost: zero,
			netPnl: zero,
		};
	}

	const frontDoorBid = side === "yes" ? yesBid : noBid;
	const frontDoorRecovery = frontDoorBid.mul(size);
	const frontDoorPnl = frontDoorBid.sub(entryPrice).mul(size);

	const backDoorAsk = side === "yes" ? noAsk : yesAsk;
	const backDoorHedgeCost = backDoorAsk.mul(size);
	const backDoorRecovery = one.mul(size);
	const backDoorPnl = one.sub(entryPrice).sub(backDoorAsk).mul(size);

	const minRecoveryThreshold = minRecoveryPct.mul(entryPrice).mul(size).neg();

	const isFrontDoorViable = frontDoorPnl.gte(minRecoveryThreshold);
	const isBackDoorViable = backDoorPnl.gte(minRecoveryThreshold);

	if (!isFrontDoorViable && !isBackDoorViable) {
		const betterRoute = frontDoorPnl.gte(backDoorPnl) ? "front" : "back";
		return betterRoute === "front"
			? {
					verdict: "trapped",
					recovery: frontDoorRecovery,
					hedgeCost: zero,
					netPnl: frontDoorPnl,
				}
			: {
					verdict: "trapped",
					recovery: backDoorRecovery,
					hedgeCost: backDoorHedgeCost,
					netPnl: backDoorPnl,
				};
	}

	if (backDoorPnl.gt(frontDoorPnl)) {
		return {
			verdict: "back_door",
			recovery: backDoorRecovery,
			hedgeCost: backDoorHedgeCost,
			netPnl: backDoorPnl,
		};
	}

	return {
		verdict: "front_door",
		recovery: frontDoorRecovery,
		hedgeCost: zero,
		netPnl: frontDoorPnl,
	};
}
