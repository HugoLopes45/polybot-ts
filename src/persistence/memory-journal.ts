/**
 * MemoryJournal — in-memory, append-only journal for strategy decisions.
 *
 * Stores JournalEntry records in an array for testing, backtesting,
 * and lightweight runtime use. Not persisted across restarts.
 */

import type { Journal, JournalEntry } from "../strategy/journal.js";

export class MemoryJournal implements Journal {
	private readonly store: JournalEntry[] = [];

	async record(event: JournalEntry): Promise<void> {
		this.store.push(event);
	}

	entries(): JournalEntry[] {
		return [...this.store];
	}

	clear(): void {
		this.store.length = 0;
	}

	get size(): number {
		return this.store.length;
	}
}
