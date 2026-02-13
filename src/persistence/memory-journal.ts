/**
 * MemoryJournal — in-memory, append-only journal for strategy decisions.
 *
 * Stores JournalEntry records in an array for testing, backtesting,
 * and lightweight runtime use. Not persisted across restarts.
 */

import type { Journal, JournalEntry } from "../strategy/journal.js";

export class MemoryJournal implements Journal {
	private readonly store: JournalEntry[] = [];

	/**
	 * Appends an entry to the in-memory journal.
	 * @param event - The journal entry to record
	 */
	async record(event: JournalEntry): Promise<void> {
		this.store.push(event);
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
