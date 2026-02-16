/**
 * QueueModel — simulates realistic limit order fills with queue position decay,
 * adverse selection, and size-dependent delays.
 *
 * Orders don't fill instantly — they have a virtual queue position that decays
 * over time. Fill probability increases when the market moves through your price
 * (adverse selection) and decreases for larger orders (size penalty).
 */

import { Decimal } from "../shared/decimal.js";

/**
 * Configuration for queue-aware fill simulation.
 *
 * @example
 * ```ts
 * const model = QueueModel.create({
 *   baseFillRate: 0.3,
 *   adverseSelectionFactor: 2.0,
 *   sizePenalty: 0.5,
 * });
 * ```
 */
export interface QueueConfig {
	/** Base fill probability per tick (0-1). Default: 0.3 */
	readonly baseFillRate: number;
	/** How much adverse price movement increases fill rate. Default: 2.0 */
	readonly adverseSelectionFactor: number;
	/** Size penalty factor — larger orders fill slower. Default: 0.5 */
	readonly sizePenalty: number;
	/** Queue decay per tick — orders move up in queue over time. Default: 0.05 */
	readonly queueDecayRate: number;
	/** Custom RNG for deterministic tests. Default: Math.random */
	readonly rng: () => number;
}

/** Virtual queue entry for a limit order. */
export interface QueueEntry {
	readonly price: Decimal;
	readonly size: Decimal;
	readonly isBuy: boolean;
	readonly enqueuedAtMs: number;
	queuePosition: number;
}

export class QueueModel {
	private readonly config: QueueConfig;
	private readonly entries: Set<QueueEntry>;

	private constructor(config: QueueConfig) {
		this.config = config;
		this.entries = new Set();
	}

	static create(config?: Partial<QueueConfig>): QueueModel {
		const fullConfig: QueueConfig = {
			baseFillRate: config?.baseFillRate ?? 0.3,
			adverseSelectionFactor: config?.adverseSelectionFactor ?? 2.0,
			sizePenalty: config?.sizePenalty ?? 0.5,
			queueDecayRate: config?.queueDecayRate ?? 0.05,
			rng: config?.rng ?? Math.random,
		};
		return new QueueModel(fullConfig);
	}

	/**
	 * Enqueue a new order and return its queue entry.
	 *
	 * @example
	 * ```ts
	 * const entry = model.enqueue(
	 *   Decimal.from(0.5),
	 *   Decimal.from(10),
	 *   true,
	 *   Date.now()
	 * );
	 * ```
	 */
	enqueue(price: Decimal, size: Decimal, isBuy: boolean, nowMs: number): QueueEntry {
		const entry: QueueEntry = {
			price,
			size,
			isBuy,
			enqueuedAtMs: nowMs,
			queuePosition: 1.0,
		};
		this.entries.add(entry);
		return entry;
	}

	/**
	 * Given current market data, determine if the order should fill.
	 * Returns effective fill price (with adverse selection slippage) or null.
	 *
	 * @example
	 * ```ts
	 * const fillPrice = model.tryFill(
	 *   entry,
	 *   Decimal.from(0.49),
	 *   Decimal.from(0.51),
	 *   Date.now()
	 * );
	 * ```
	 */
	tryFill(
		entry: QueueEntry,
		currentBid: Decimal,
		currentAsk: Decimal,
		nowMs: number,
	): Decimal | null {
		if (!this.entries.has(entry)) {
			return null;
		}

		const timeInQueueMs = nowMs - entry.enqueuedAtMs;
		const timeInQueueTicks = timeInQueueMs / 1000;
		const decay = this.config.queueDecayRate * timeInQueueTicks;
		const effectiveQueuePosition = Math.max(0, entry.queuePosition - decay);

		const adverseBonus = this.computeAdverseBonus(entry, currentBid, currentAsk);
		const penalty = this.computeSizePenalty(entry.size);

		let fillProbability =
			this.config.baseFillRate * (1 - effectiveQueuePosition) + adverseBonus - penalty;
		fillProbability = Math.max(0, Math.min(1, fillProbability));

		if (this.config.rng() < fillProbability) {
			const effectivePrice = entry.isBuy
				? Decimal.min(entry.price, currentAsk)
				: Decimal.max(entry.price, currentBid);
			return effectivePrice;
		}

		return null;
	}

	/**
	 * Remove an entry from the queue.
	 *
	 * @example
	 * ```ts
	 * model.remove(entry);
	 * ```
	 */
	remove(entry: QueueEntry): void {
		this.entries.delete(entry);
	}

	private computeAdverseBonus(entry: QueueEntry, currentBid: Decimal, currentAsk: Decimal): number {
		if (entry.isBuy) {
			if (currentAsk.lte(entry.price)) {
				const diff = entry.price.sub(currentAsk);
				const ratio = diff.div(entry.price).toNumber();
				return this.config.adverseSelectionFactor * ratio;
			}
		} else {
			if (currentBid.gte(entry.price)) {
				const diff = currentBid.sub(entry.price);
				const ratio = diff.div(entry.price).toNumber();
				return this.config.adverseSelectionFactor * ratio;
			}
		}
		return 0;
	}

	private computeSizePenalty(size: Decimal): number {
		const sizeNum = size.toNumber();
		const penalty = this.config.sizePenalty * (sizeNum - 1);
		return Math.max(0, penalty);
	}
}
