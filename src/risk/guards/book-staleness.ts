import type { EntryGuard, GuardContext, GuardVerdict } from "../types.js";
import { allow, blockWithValues } from "../types.js";

/**
 * Guard that checks if the order book data is stale.
 * Blocks orders when the time since last book update exceeds the threshold.
 */
export class BookStalenessGuard implements EntryGuard {
	readonly name = "BookStaleness";
	private readonly maxAgeMs: number;

	private constructor(maxAgeMs: number) {
		this.maxAgeMs = maxAgeMs;
	}

	/**
	 * Creates a new BookStalenessGuard with the specified max age.
	 * @param maxAgeMs - Maximum age in milliseconds before book is considered stale
	 * @example
	 * const guard = BookStalenessGuard.create(5000); // 5 seconds
	 */
	static create(maxAgeMs: number): BookStalenessGuard {
		return new BookStalenessGuard(maxAgeMs);
	}

	/**
	 * Creates a guard from seconds for convenience.
	 * @param secs - Maximum age in seconds
	 * @example
	 * const guard = BookStalenessGuard.fromSecs(10); // 10 seconds
	 */
	static fromSecs(secs: number): BookStalenessGuard {
		return new BookStalenessGuard(secs * 1_000);
	}

	check(ctx: GuardContext): GuardVerdict {
		const age = ctx.bookAgeMs();
		if (age === null) return allow();

		if (age > this.maxAgeMs) {
			return blockWithValues(this.name, "order book stale", age / 1_000, this.maxAgeMs / 1_000);
		}
		return allow();
	}
}
