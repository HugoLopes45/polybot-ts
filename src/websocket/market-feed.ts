import type { ConnectivityWatchdog } from "../lifecycle/watchdog.js";
import { applyDelta } from "../market/orderbook.js";
import type { OrderbookDelta, OrderbookLevel, OrderbookSnapshot } from "../market/types.js";
import { Decimal } from "../shared/decimal.js";
import type { ConditionId } from "../shared/identifiers.js";
import type { BookUpdate, WsMessage } from "./types.js";

/**
 * Maintains per-condition orderbook snapshots from BookUpdate messages.
 *
 * Each incoming BookUpdate is parsed into Decimal levels, applied as a delta
 * to the stored snapshot, and touches the watchdog to signal feed liveness.
 */
export class MarketFeed {
	private readonly watchdog: ConnectivityWatchdog;
	private readonly books: Map<string, OrderbookSnapshot> = new Map();

	constructor(watchdog: ConnectivityWatchdog) {
		this.watchdog = watchdog;
	}

	processMessages(messages: readonly WsMessage[]): void {
		for (const msg of messages) {
			if (msg.type === "book_update") {
				this.applyBookUpdate(msg);
				this.watchdog.touch();
			}
		}
	}

	getBook(cid: ConditionId): OrderbookSnapshot | null {
		return this.books.get(cid as string) ?? null;
	}

	private applyBookUpdate(update: BookUpdate): void {
		const key = update.conditionId as string;
		const existing = this.books.get(key) ?? emptyBook(update.timestampMs);
		const delta = toDelta(update);
		const updated = applyDelta(existing, delta);
		this.books.set(key, { ...updated, timestampMs: update.timestampMs });
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
