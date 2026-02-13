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
		while (this.store.length > this.maxEntries) {
			this.store.shift();
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

	get size(): number {
		return this.store.length;
	}
}
