/**
 * OFI (Order Flow Imbalance) tracker for orderbook pressure analysis.
 *
 * Tracks bid/ask queue changes between orderbook snapshots.
 * Signed OFI = delta_bid_qty - delta_ask_qty at best level(s).
 * Positive OFI indicates buying pressure, negative indicates selling pressure.
 */
import { Decimal } from "../shared/decimal.js";

export interface BookLevel {
	readonly price: Decimal;
	readonly size: Decimal;
}

export interface OfiSnapshot {
	readonly bestBid: BookLevel | null;
	readonly bestAsk: BookLevel | null;
}

interface InternalSnapshot {
	readonly bidPrice: Decimal | null;
	readonly bidSize: Decimal;
	readonly askPrice: Decimal | null;
	readonly askSize: Decimal;
}

export class OfiTracker {
	private prev: InternalSnapshot | null;
	private cumulativeOfi: Decimal;

	private constructor() {
		this.prev = null;
		this.cumulativeOfi = Decimal.zero();
	}

	static create(): OfiTracker {
		return new OfiTracker();
	}

	/**
	 * Feed a new orderbook snapshot.
	 * Returns signed OFI delta, or null on first call.
	 */
	update(snapshot: OfiSnapshot): Decimal | null {
		const current = this.normalize(snapshot);

		if (this.prev === null) {
			this.prev = current;
			return null;
		}

		const deltaBid = this.calcBidDelta(this.prev, current);
		const deltaAsk = this.calcAskDelta(this.prev, current);
		const ofi = deltaBid.sub(deltaAsk);

		this.cumulativeOfi = this.cumulativeOfi.add(ofi);
		this.prev = current;

		return ofi;
	}

	/**
	 * Cumulative OFI since creation/reset.
	 */
	cumulative(): Decimal {
		return this.cumulativeOfi;
	}

	/**
	 * Reset state.
	 */
	reset(): void {
		this.prev = null;
		this.cumulativeOfi = Decimal.zero();
	}

	private normalize(snapshot: OfiSnapshot): InternalSnapshot {
		return {
			bidPrice: snapshot.bestBid?.price ?? null,
			bidSize: snapshot.bestBid?.size ?? Decimal.zero(),
			askPrice: snapshot.bestAsk?.price ?? null,
			askSize: snapshot.bestAsk?.size ?? Decimal.zero(),
		};
	}

	private calcBidDelta(prev: InternalSnapshot, current: InternalSnapshot): Decimal {
		if (prev.bidPrice === null && current.bidPrice === null) {
			return Decimal.zero();
		}

		if (prev.bidPrice === null) {
			return Decimal.zero();
		}

		if (current.bidPrice === null) {
			return prev.bidSize.neg();
		}

		if (prev.bidPrice.eq(current.bidPrice)) {
			return current.bidSize.sub(prev.bidSize);
		}

		if (current.bidPrice.gt(prev.bidPrice)) {
			return current.bidSize;
		}

		return prev.bidSize.neg();
	}

	private calcAskDelta(prev: InternalSnapshot, current: InternalSnapshot): Decimal {
		if (prev.askPrice === null && current.askPrice === null) {
			return Decimal.zero();
		}

		if (prev.askPrice === null) {
			return Decimal.zero();
		}

		if (current.askPrice === null) {
			return prev.askSize.neg();
		}

		if (prev.askPrice.eq(current.askPrice)) {
			return current.askSize.sub(prev.askSize);
		}

		if (current.askPrice.lt(prev.askPrice)) {
			return current.askSize;
		}

		return prev.askSize.neg();
	}
}
