import type { OrderbookLevel, OrderbookSnapshot } from "../market/types.js";
import { Decimal } from "../shared/decimal.js";
import type { TradingError } from "../shared/errors.js";
import type { ConditionId } from "../shared/identifiers.js";
import type { Result } from "../shared/result.js";
import { ok } from "../shared/result.js";
import type { BookUpdate } from "./types.js";
import type { WsManager } from "./ws-manager.js";

export class MultiMarketManager {
	private readonly books: Map<ConditionId, OrderbookSnapshot> = new Map();
	private readonly markets: Set<ConditionId> = new Set();

	constructor(private readonly wsManager: WsManager) {}

	addMarket(conditionId: ConditionId): Result<void, TradingError> {
		if (this.markets.has(conditionId)) {
			return ok(undefined);
		}

		this.markets.add(conditionId);

		return this.wsManager.subscribe({
			channel: "book",
			assets: [conditionId as string],
		});
	}

	removeMarket(conditionId: ConditionId): void {
		if (!this.markets.has(conditionId)) {
			return;
		}

		this.markets.delete(conditionId);
		this.books.delete(conditionId);

		// Only unsubscribe from the book channel if no markets remain
		if (this.markets.size === 0) {
			this.wsManager.unsubscribe("book");
		}
	}

	getBook(conditionId: ConditionId): OrderbookSnapshot | null {
		const book = this.books.get(conditionId);
		if (!book || book.timestampMs === 0) {
			return null;
		}
		return book;
	}

	processUpdates(): void {
		const messages = this.wsManager.drain();

		for (const msg of messages) {
			if (msg.type !== "book_update") continue;

			const bookUpdate = msg as BookUpdate;
			try {
				this.applyBookUpdate(bookUpdate);
			} catch {
				// Skip malformed updates — one bad message must not kill the loop
			}
		}
	}

	activeMarkets(): readonly ConditionId[] {
		return [...this.markets];
	}

	private applyBookUpdate(update: BookUpdate): void {
		if (!this.markets.has(update.conditionId)) {
			return;
		}

		let book = this.books.get(update.conditionId);
		if (!book) {
			book = { bids: [], asks: [], timestampMs: 0 };
			this.books.set(update.conditionId, book);
		}

		const delta = {
			bids: update.bids.map((b) => ({
				price: Decimal.from(b.price),
				size: Decimal.from(b.size),
			})),
			asks: update.asks.map((a) => ({
				price: Decimal.from(a.price),
				size: Decimal.from(a.size),
			})),
		};

		const updatedBook = applyDelta(book, delta, update.timestampMs);
		this.books.set(update.conditionId, updatedBook);
	}
}

function applyDelta(
	book: OrderbookSnapshot,
	delta: { bids: readonly OrderbookLevel[]; asks: readonly OrderbookLevel[] },
	timestampMs: number,
): OrderbookSnapshot {
	const bids = mergeLevels(book.bids, delta.bids, "desc");
	const asks = mergeLevels(book.asks, delta.asks, "asc");
	return { bids, asks, timestampMs };
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
