import type { OrderbookSnapshot } from "../market/types.js";
import { Decimal } from "../shared/decimal.js";

/**
 * Bid/ask imbalance ratio: bidVolume / askVolume.
 * Returns > 1 when bids dominate, < 1 when asks dominate, zero for empty book.
 */
export function calcImbalanceRatio(book: OrderbookSnapshot, depthLevels?: number): Decimal {
	const bidLevels = depthLevels !== undefined ? book.bids.slice(0, depthLevels) : book.bids;
	const askLevels = depthLevels !== undefined ? book.asks.slice(0, depthLevels) : book.asks;

	let bidVolume = Decimal.zero();
	for (const level of bidLevels) {
		bidVolume = bidVolume.add(level.size);
	}

	let askVolume = Decimal.zero();
	for (const level of askLevels) {
		askVolume = askVolume.add(level.size);
	}

	if (askVolume.isZero()) return Decimal.zero();
	return bidVolume.div(askVolume);
}

/**
 * Volume-weighted average price across a set of trades / fills.
 * Returns null for empty input or zero total size.
 */
export function calcVWAP(
	trades: readonly { readonly price: Decimal; readonly size: Decimal }[],
): Decimal | null {
	if (trades.length === 0) return null;

	let totalNotional = Decimal.zero();
	let totalSize = Decimal.zero();
	for (const trade of trades) {
		totalNotional = totalNotional.add(trade.price.mul(trade.size));
		totalSize = totalSize.add(trade.size);
	}

	if (totalSize.isZero()) return null;
	return totalNotional.div(totalSize);
}

/**
 * Spread in basis points: (bestAsk - bestBid) / midPrice * 10000.
 * Returns null when either side of the book is empty.
 */
export function calcSpreadBps(book: OrderbookSnapshot): Decimal | null {
	const bestBid = book.bids[0];
	const bestAsk = book.asks[0];
	if (!bestBid || !bestAsk) return null;

	const spread = bestAsk.price.sub(bestBid.price);
	const mid = bestAsk.price.add(bestBid.price).div(Decimal.from(2));
	if (mid.isZero()) return null;

	return spread.div(mid).mul(Decimal.from(10000));
}

/**
 * Estimated price slippage for a given order size by walking the book.
 * Returns abs(VWAP - bestPrice). Zero if the order fits within the best level.
 */
export function estimateSlippage(
	book: OrderbookSnapshot,
	side: "buy" | "sell",
	size: Decimal,
): Decimal {
	const levels = side === "buy" ? book.asks : book.bids;
	if (levels.length === 0) return Decimal.zero();

	const bestPrice = levels[0]?.price ?? Decimal.zero();
	let remaining = size;
	let totalNotional = Decimal.zero();
	let totalFilled = Decimal.zero();

	for (const level of levels) {
		if (remaining.lte(Decimal.zero())) break;
		const fillSize = Decimal.min(remaining, level.size);
		totalNotional = totalNotional.add(level.price.mul(fillSize));
		totalFilled = totalFilled.add(fillSize);
		remaining = remaining.sub(fillSize);
	}

	if (totalFilled.isZero()) return Decimal.zero();
	const vwap = totalNotional.div(totalFilled);
	return vwap.sub(bestPrice).abs();
}

/**
 * Total available depth (size) on one side of the book.
 * "buy" side reads asks (available for buying), "sell" reads bids.
 */
export function calcBookDepth(
	book: OrderbookSnapshot,
	side: "buy" | "sell",
	priceLevels?: number,
): Decimal {
	const levels = side === "buy" ? book.asks : book.bids;
	const limited = priceLevels !== undefined ? levels.slice(0, priceLevels) : levels;

	let total = Decimal.zero();
	for (const level of limited) {
		total = total.add(level.size);
	}
	return total;
}
