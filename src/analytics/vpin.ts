/**
 * VPIN — Volume-Synchronized Probability of Informed Trading.
 *
 * Rolling bucket trade classifier that computes VPIN = |V_buy - V_sell| / V_total.
 * Uses tick rule for trade classification: price > lastPrice → buy, price < lastPrice → sell.
 */
import { Decimal } from "../shared/decimal.js";

export interface VpinConfig {
	readonly bucketSize: Decimal;
	readonly numBuckets: number;
}

export interface TradeUpdate {
	readonly price: Decimal;
	readonly size: Decimal;
	readonly timestampMs: number;
}

interface Bucket {
	readonly buyVolume: Decimal;
	readonly sellVolume: Decimal;
	readonly totalVolume: Decimal;
}

type TradeDirection = "buy" | "sell";

export class VpinTracker {
	private readonly config: VpinConfig;
	private readonly buckets: Bucket[];
	private lastPrice: Decimal | null;
	private lastDirection: TradeDirection | null;
	private currentBuyVolume: Decimal;
	private currentSellVolume: Decimal;
	private currentTotalVolume: Decimal;

	private constructor(config: VpinConfig) {
		this.config = config;
		this.buckets = [];
		this.lastPrice = null;
		this.lastDirection = null;
		this.currentBuyVolume = Decimal.zero();
		this.currentSellVolume = Decimal.zero();
		this.currentTotalVolume = Decimal.zero();
	}

	/**
	 * Creates a VPIN tracker with validated configuration.
	 * @param config - Bucket size (volume per bucket) and number of rolling buckets
	 * @returns New VpinTracker instance
	 * @throws Error if bucketSize is not positive or numBuckets < 1
	 */
	static create(config: VpinConfig): VpinTracker {
		if (config.bucketSize.isZero() || config.bucketSize.isNegative()) {
			throw new Error("VpinTracker: bucketSize must be positive");
		}
		if (config.numBuckets < 1) {
			throw new Error("VpinTracker: numBuckets must be >= 1");
		}
		return new VpinTracker(config);
	}

	/**
	 * Feeds a trade update into the VPIN tracker.
	 * Classifies the trade as buy/sell using the tick rule and fills volume buckets.
	 * @param trade - Trade with price, size, and timestamp
	 */
	update(trade: TradeUpdate): void {
		const direction = this.classifyTrade(trade.price);
		this.lastPrice = trade.price;
		this.lastDirection = direction;

		let remainingSize = trade.size;

		while (remainingSize.gt(Decimal.zero())) {
			const spaceInBucket = this.config.bucketSize.sub(this.currentTotalVolume);
			const toAdd = Decimal.min(remainingSize, spaceInBucket);

			if (direction === "buy") {
				this.currentBuyVolume = this.currentBuyVolume.add(toAdd);
			} else {
				this.currentSellVolume = this.currentSellVolume.add(toAdd);
			}
			this.currentTotalVolume = this.currentTotalVolume.add(toAdd);
			remainingSize = remainingSize.sub(toAdd);

			if (this.currentTotalVolume.gte(this.config.bucketSize)) {
				this.sealCurrentBucket();
			}
		}
	}

	/**
	 * Returns the current VPIN value, or null if insufficient buckets are filled.
	 * @returns VPIN in [0, 1] where 0 = balanced flow, 1 = fully one-sided. Null if < numBuckets filled.
	 */
	value(): Decimal | null {
		if (this.buckets.length < this.config.numBuckets) {
			return null;
		}

		let totalAbsImbalance = Decimal.zero();
		let totalVolume = Decimal.zero();

		for (const bucket of this.buckets) {
			const imbalance = bucket.buyVolume.sub(bucket.sellVolume).abs();
			totalAbsImbalance = totalAbsImbalance.add(imbalance);
			totalVolume = totalVolume.add(bucket.totalVolume);
		}

		if (totalVolume.isZero()) {
			return Decimal.zero();
		}

		return totalAbsImbalance.div(totalVolume);
	}

	get filledBuckets(): number {
		return this.buckets.length;
	}

	private classifyTrade(price: Decimal): TradeDirection {
		if (this.lastPrice === null) {
			return "buy";
		}

		if (price.gt(this.lastPrice)) {
			return "buy";
		}
		if (price.lt(this.lastPrice)) {
			return "sell";
		}

		return this.lastDirection ?? "buy";
	}

	private sealCurrentBucket(): void {
		const bucket: Bucket = {
			buyVolume: this.currentBuyVolume,
			sellVolume: this.currentSellVolume,
			totalVolume: this.currentTotalVolume,
		};

		this.buckets.push(bucket);

		if (this.buckets.length > this.config.numBuckets) {
			this.buckets.shift();
		}

		this.currentBuyVolume = Decimal.zero();
		this.currentSellVolume = Decimal.zero();
		this.currentTotalVolume = Decimal.zero();
	}
}
