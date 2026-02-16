/**
 * Idempotency guard — prevents duplicate order submissions.
 *
 * Maintains a hash set of order signature tuples with TTL.
 * Rejects order intents that match a recently submitted signature.
 */
import type { Clock } from "../shared/time.js";

export interface IdempotencyConfig {
	readonly ttlMs: number;
}

interface Entry {
	readonly expiresMs: number;
}

/**
 * Order signature — unique tuple identifying an order intent.
 * Composed of tokenId + side + price + size.
 */
function orderKey(tokenId: string, side: string, price: string, size: string): string {
	return `${tokenId}:${side}:${price}:${size}`;
}

export class IdempotencyGuard {
	private readonly entries = new Map<string, Entry>();
	private readonly ttlMs: number;
	private readonly clock: Clock;

	private constructor(config: IdempotencyConfig, clock: Clock) {
		this.ttlMs = config.ttlMs;
		this.clock = clock;
	}

	static create(config: IdempotencyConfig, clock: Clock): IdempotencyGuard {
		return new IdempotencyGuard(config, clock);
	}

	/**
	 * Check if this order intent is a duplicate.
	 * If not a duplicate, records it and returns false.
	 * If duplicate, returns true (reject).
	 */
	isDuplicate(tokenId: string, side: string, price: string, size: string): boolean {
		this.evict();
		const key = orderKey(tokenId, side, price, size);
		const existing = this.entries.get(key);
		if (existing) return true;

		this.entries.set(key, { expiresMs: this.clock.now() + this.ttlMs });
		return false;
	}

	/** Number of active (non-expired) entries. */
	get size(): number {
		this.evict();
		return this.entries.size;
	}

	/** Clear all entries. */
	clear(): void {
		this.entries.clear();
	}

	private evict(): void {
		const now = this.clock.now();
		for (const [key, entry] of this.entries) {
			if (entry.expiresMs <= now) {
				this.entries.delete(key);
			}
		}
	}
}
