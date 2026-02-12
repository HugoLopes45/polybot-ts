import type { EntryGuard, GuardContext, GuardVerdict } from "../types.js";
import { allow, blockWithValues } from "../types.js";

export class BookStalenessGuard implements EntryGuard {
	readonly name = "BookStaleness";
	private readonly maxAgeMs: number;

	private constructor(maxAgeMs: number) {
		this.maxAgeMs = maxAgeMs;
	}

	static create(maxAgeMs: number): BookStalenessGuard {
		return new BookStalenessGuard(maxAgeMs);
	}

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
