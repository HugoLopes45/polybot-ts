import { Decimal } from "../shared/decimal.js";
import type { OrderbookDelta, OrderbookLevel, OrderbookSnapshot } from "./types.js";

export function applyDelta(book: OrderbookSnapshot, delta: OrderbookDelta): OrderbookSnapshot {
	const bids = mergeLevels(book.bids, delta.bids, "desc");
	const asks = mergeLevels(book.asks, delta.asks, "asc");
	return { bids, asks, timestampMs: book.timestampMs };
}

function mergeLevels(
	existing: readonly OrderbookLevel[],
	updates: readonly OrderbookLevel[],
	direction: "asc" | "desc",
): OrderbookLevel[] {
	const map = new Map<string, OrderbookLevel>();
	for (const lvl of existing) {
		map.set(lvl.price.toString(), lvl);
	}
	for (const lvl of updates) {
		if (lvl.size.isZero()) {
			map.delete(lvl.price.toString());
		} else {
			map.set(lvl.price.toString(), lvl);
		}
	}
	const sorted = [...map.values()];
	sorted.sort((a, b) => {
		if (direction === "desc") {
			return a.price.gt(b.price) ? -1 : a.price.lt(b.price) ? 1 : 0;
		}
		return a.price.lt(b.price) ? -1 : a.price.gt(b.price) ? 1 : 0;
	});
	return sorted;
}

export function bestBid(book: OrderbookSnapshot): Decimal | null {
	return book.bids[0]?.price ?? null;
}

export function bestAsk(book: OrderbookSnapshot): Decimal | null {
	return book.asks[0]?.price ?? null;
}

export function spread(book: OrderbookSnapshot): Decimal | null {
	const bid = bestBid(book);
	const ask = bestAsk(book);
	if (bid === null || ask === null) return null;
	return ask.sub(bid);
}

export function midPrice(book: OrderbookSnapshot): Decimal | null {
	const bid = bestBid(book);
	const ask = bestAsk(book);
	if (bid === null || ask === null) return null;
	return bid.add(ask).div(Decimal.from(2));
}

export function effectivePrice(
	book: OrderbookSnapshot,
	size: Decimal,
	side: "buy" | "sell",
): Decimal | null {
	if (size.isZero()) return null;
	const levels = side === "buy" ? book.asks : book.bids;
	let remaining = size;
	let totalCost = Decimal.zero();

	for (const lvl of levels) {
		if (remaining.isZero()) break;
		const fillSize = Decimal.min(remaining, lvl.size);
		totalCost = totalCost.add(fillSize.mul(lvl.price));
		remaining = remaining.sub(fillSize);
	}

	if (remaining.isPositive()) return null;
	return totalCost.div(size);
}
