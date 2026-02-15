import type { ConnectivityWatchdog } from "../lifecycle/watchdog.js";
import { applyDelta } from "../market/orderbook.js";
import type { OrderbookDelta, OrderbookLevel, OrderbookSnapshot } from "../market/types.js";
import { Decimal } from "../shared/decimal.js";
import type { ConditionId } from "../shared/identifiers.js";
import type { BookUpdate, WsMessage } from "./types.js";

export interface MarketFeedConfig {
	maxBooks?: number;
}

const DEFAULT_MAX_BOOKS = 100;

/**
 * Maintains per-condition orderbook snapshots from BookUpdate messages.
 *
 * Each incoming BookUpdate is parsed into Decimal levels, applied as a delta
 * to the stored snapshot, and touches the watchdog to signal feed liveness.
 */
export class MarketFeed {
	private readonly watchdog: ConnectivityWatchdog;
	private readonly maxBooks: number;
	private readonly books: Map<string, OrderbookSnapshot> = new Map();
	private readonly accessOrder: string[] = [];

	constructor(watchdog: ConnectivityWatchdog, config: MarketFeedConfig = {}) {
		this.watchdog = watchdog;
		this.maxBooks = config.maxBooks ?? DEFAULT_MAX_BOOKS;
	}

	/**
	 * Processes incoming WebSocket messages, applying book updates to snapshots.
	 * @param messages - Array of WebSocket messages to process
	 */
	processMessages(messages: readonly WsMessage[]): void {
		for (const msg of messages) {
			if (msg.type === "book_update") {
				this.applyBookUpdate(msg);
				this.watchdog.touch();
			}
		}
	}

	/**
	 * Returns the current orderbook snapshot for a condition.
	 * @param cid - The condition ID to look up
	 * @returns The orderbook snapshot, or null if no data received yet
	 */
	getBook(cid: ConditionId): OrderbookSnapshot | null {
		const key = cid as string;
		const book = this.books.get(key) ?? null;
		if (book !== null) {
			this.touch(key);
		}
		return book;
	}

	/**
	 * Explicitly removes an orderbook snapshot for a condition.
	 * @param cid - The condition ID to remove
	 */
	removeBook(cid: ConditionId): void {
		const key = cid as string;
		this.books.delete(key);
		const idx = this.accessOrder.indexOf(key);
		if (idx !== -1) {
			this.accessOrder.splice(idx, 1);
		}
	}

	// O(n) indexOf+splice — acceptable at maxBooks=100; consider LinkedHashMap if scaling beyond ~1K
	private touch(key: string): void {
		const idx = this.accessOrder.indexOf(key);
		if (idx !== -1) {
			this.accessOrder.splice(idx, 1);
		}
		this.accessOrder.push(key);
	}

	private evictIfNeeded(): void {
		while (this.books.size > this.maxBooks && this.accessOrder.length > 0) {
			const lruKey = this.accessOrder.shift();
			if (lruKey === undefined) break;
			this.books.delete(lruKey);
		}
	}

	private applyBookUpdate(update: BookUpdate): void {
		const key = update.conditionId as string;
		const existing = this.books.get(key) ?? emptyBook(update.timestampMs);
		const delta = toDelta(update);
		const updated = applyDelta(existing, delta);
		this.books.set(key, { ...updated, timestampMs: update.timestampMs });
		this.touch(key);
		this.evictIfNeeded();
	}
}

function emptyBook(timestampMs: number): OrderbookSnapshot {
	return { bids: [], asks: [], timestampMs };
}

function parseLevel(raw: { readonly price: string; readonly size: string }): OrderbookLevel {
	return { price: Decimal.from(raw.price), size: Decimal.from(raw.size) };
}

function toDelta(update: BookUpdate): OrderbookDelta {
	return {
		bids: update.bids.map(parseLevel),
		asks: update.asks.map(parseLevel),
	};
}
