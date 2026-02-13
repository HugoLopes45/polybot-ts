import { applyDelta as canonicalApplyDelta } from "../market/orderbook.js";
import type { OrderbookSnapshot } from "../market/types.js";
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
	private readonly _parseErrors: Error[] = [];

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
			} catch (e: unknown) {
				// Only swallow Decimal parse errors; capture unexpected errors
				if (
					e instanceof Error &&
					(e.message.includes("DecimalError") || e.message.includes("Invalid"))
				) {
					continue;
				}
				if (e instanceof Error) {
					if (this._parseErrors.length < 100) {
						this._parseErrors.push(e);
					}
				}
			}
		}
	}

	/** Drains and returns captured parse errors, clearing the internal list. */
	drainParseErrors(): Error[] {
		const errors = [...this._parseErrors];
		this._parseErrors.length = 0;
		return errors;
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

		const applied = canonicalApplyDelta(book, delta);
		const updatedBook = { ...applied, timestampMs: update.timestampMs };
		this.books.set(update.conditionId, updatedBook);
	}
}
