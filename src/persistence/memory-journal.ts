/**
 * MemoryJournal — in-memory, append-only journal for strategy decisions.
 *
 * Stores JournalEntry records in an array for testing, backtesting,
 * and lightweight runtime use. Not persisted across restarts.
 */

import type { Journal, JournalEntry } from "../strategy/journal.js";

/** Configuration for creating a MemoryJournal instance. */
export interface MemoryJournalConfig {
	readonly maxEntries?: number;
}

export class MemoryJournal implements Journal {
	private readonly store: JournalEntry[] = [];
	private readonly maxEntries: number;

	constructor(config?: MemoryJournalConfig) {
		this.maxEntries = config?.maxEntries ?? Number.POSITIVE_INFINITY;
	}

	/**
	 * Appends an entry to the in-memory journal.
	 * @param event - The journal entry to record
	 */
	async record(event: JournalEntry): Promise<void> {
		this.store.push(event);
		const excess = this.store.length - this.maxEntries;
		if (excess > 0) {
			this.store.splice(0, excess);
		}
	}

	/** Returns a shallow copy of all recorded journal entries. */
	entries(): JournalEntry[] {
		return [...this.store];
	}

	/** Removes all entries from the journal. */
	clear(): void {
		this.store.length = 0;
	}

	/** No-op for in-memory journal - writes are synchronous. */
	async flush(): Promise<void> {}

	get size(): number {
		return this.store.length;
	}
}
