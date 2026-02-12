import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { clientOrderId, conditionId, marketTokenId } from "../shared/identifiers.js";
import type { JournalEntry } from "../strategy/journal.js";
import { MemoryJournal } from "./memory-journal.js";

// ── Test data factories ─────────────────────────────────────────────

function makeGuardBlocked(guardName = "maxExposure", timestamp = 1000): JournalEntry {
	return { type: "guard_blocked", guardName, reason: "limit exceeded", timestamp };
}

function makeError(timestamp = 2000): JournalEntry {
	return { type: "error", code: "EXEC_FAILED", message: "timeout", timestamp };
}

function makeEntrySignal(timestamp = 3000): JournalEntry {
	return {
		type: "entry_signal",
		signal: { edge: 0.05 },
		intent: {
			conditionId: conditionId("cond-1"),
			tokenId: marketTokenId("tok-1"),
			side: "yes",
			direction: "buy",
			price: Decimal.from("0.55"),
			size: Decimal.from("10"),
		},
		timestamp,
	};
}

function makePositionOpened(timestamp = 4000): JournalEntry {
	return {
		type: "position_opened",
		conditionId: conditionId("cond-1"),
		tokenId: marketTokenId("tok-1"),
		side: "yes",
		entryPrice: 0.55,
		size: 10,
		timestamp,
	};
}

function makeOrderSubmitted(timestamp = 5000): JournalEntry {
	return {
		type: "order_submitted",
		intent: {
			conditionId: conditionId("cond-1"),
			tokenId: marketTokenId("tok-1"),
			side: "yes",
			direction: "buy",
			price: Decimal.from("0.55"),
			size: Decimal.from("10"),
		},
		clientOrderId: clientOrderId("order-1"),
		timestamp,
	};
}

function makeOrderFilled(timestamp = 6000): JournalEntry {
	return {
		type: "order_filled",
		clientOrderId: clientOrderId("order-1"),
		fillPrice: 0.55,
		size: 10,
		fee: 0.01,
		timestamp,
	};
}

function makeExitSignal(timestamp = 7000): JournalEntry {
	return {
		type: "exit_signal",
		conditionId: conditionId("cond-1"),
		reason: { type: "take_profit", roi: Decimal.from("0.10") },
		timestamp,
	};
}

function makePositionClosed(timestamp = 8000): JournalEntry {
	return {
		type: "position_closed",
		conditionId: conditionId("cond-1"),
		entryPrice: 0.55,
		exitPrice: 0.65,
		pnl: 1.0,
		reason: "take_profit",
		timestamp,
	};
}

// ── Tests ───────────────────────────────────────────────────────────

describe("MemoryJournal", () => {
	it("record stores an entry", async () => {
		const journal = new MemoryJournal();
		const entry = makeGuardBlocked();

		await journal.record(entry);

		expect(journal.entries()).toEqual([entry]);
	});

	it("entries() returns all recorded entries in insertion order", async () => {
		const journal = new MemoryJournal();
		const e1 = makeGuardBlocked(1000);
		const e2 = makeError(2000);
		const e3 = makeEntrySignal(3000);

		await journal.record(e1);
		await journal.record(e2);
		await journal.record(e3);

		expect(journal.entries()).toEqual([e1, e2, e3]);
	});

	it("multiple records preserve insertion order (not timestamp order)", async () => {
		const journal = new MemoryJournal();
		const late = makeError(9999);
		const early = makeGuardBlocked(1);

		await journal.record(late);
		await journal.record(early);

		const result = journal.entries();
		expect(result[0]).toBe(late);
		expect(result[1]).toBe(early);
	});

	it("clear() resets entries to empty", async () => {
		const journal = new MemoryJournal();
		await journal.record(makeGuardBlocked());
		await journal.record(makeError());

		journal.clear();

		expect(journal.entries()).toEqual([]);
		expect(journal.size).toBe(0);
	});

	it("size getter returns correct count", async () => {
		const journal = new MemoryJournal();

		expect(journal.size).toBe(0);

		await journal.record(makeGuardBlocked());
		expect(journal.size).toBe(1);

		await journal.record(makeError());
		expect(journal.size).toBe(2);
	});

	it("record() returns a resolved Promise (async contract)", async () => {
		const journal = new MemoryJournal();
		const result = journal.record(makeGuardBlocked());

		expect(result).toBeInstanceOf(Promise);
		await expect(result).resolves.toBeUndefined();
	});

	it("entries() returns a new array (no mutation leakage)", async () => {
		const journal = new MemoryJournal();
		await journal.record(makeGuardBlocked());

		const first = journal.entries();
		const second = journal.entries();

		expect(first).not.toBe(second);
		expect(first).toEqual(second);

		// Mutating the returned array does not affect internal state
		first.push(makeError());
		expect(journal.entries()).toHaveLength(1);
	});

	it("works with all JournalEntry variants", async () => {
		const journal = new MemoryJournal();
		const variants: JournalEntry[] = [
			makeEntrySignal(),
			makeExitSignal(),
			makeOrderSubmitted(),
			makeOrderFilled(),
			makePositionOpened(),
			makePositionClosed(),
			makeGuardBlocked(),
			makeError(),
		];

		for (const entry of variants) {
			await journal.record(entry);
		}

		expect(journal.entries()).toEqual(variants);
		expect(journal.size).toBe(8);
	});
});
