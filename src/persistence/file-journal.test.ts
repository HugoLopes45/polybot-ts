import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { clientOrderId, conditionId, marketTokenId } from "../shared/identifiers.js";
import type { JournalEntry } from "../strategy/journal.js";
import { FileJournal } from "./file-journal.js";

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

/**
 * Normalize an entry through JSON roundtrip so comparisons
 * account for Decimal/branded-type serialization.
 */
function jsonRoundtrip<T>(value: T): unknown {
	return JSON.parse(JSON.stringify(value));
}

// ── Tests ───────────────────────────────────────────────────────────

describe("FileJournal", () => {
	let tmpDir: string;
	let filePath: string;

	beforeEach(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "file-journal-"));
		filePath = join(tmpDir, "journal.jsonl");
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	function createJournal(): FileJournal {
		return FileJournal.create({ filePath });
	}

	it("record() writes a JSONL line to the file", async () => {
		const journal = createJournal();
		const entry = makeGuardBlocked();

		await journal.record(entry);

		const content = await readFile(filePath, "utf-8");
		const lines = content.split("\n").filter((l) => l.length > 0);
		expect(lines).toHaveLength(1);
		const firstLine = lines[0];
		expect(firstLine).toBeDefined();
		expect(JSON.parse(firstLine as string)).toEqual(jsonRoundtrip(entry));
	});

	it("restore() reads back all entries from file in order", async () => {
		const journal = createJournal();
		const e1 = makeGuardBlocked(1000);
		const e2 = makeError(2000);
		const e3 = makePositionOpened(3000);

		await journal.record(e1);
		await journal.record(e2);
		await journal.record(e3);

		const result = await journal.restore();

		expect(result.entries).toEqual([jsonRoundtrip(e1), jsonRoundtrip(e2), jsonRoundtrip(e3)]);
		expect(result.corruptLines).toHaveLength(0);
	});

	it("write/read roundtrip: record N entries, restore returns them all", async () => {
		const journal = createJournal();
		const entries: JournalEntry[] = [
			makeGuardBlocked(100),
			makeError(200),
			makeEntrySignal(300),
			makePositionOpened(400),
			makeOrderSubmitted(500),
		];

		for (const entry of entries) {
			await journal.record(entry);
		}

		const result = await journal.restore();
		expect(result.entries).toHaveLength(entries.length);
		expect(result.entries).toEqual(entries.map((e) => jsonRoundtrip(e)));
		expect(result.corruptLines).toHaveLength(0);
	});

	it("restore() reports corrupt/malformed lines instead of silently dropping", async () => {
		const journal = createJournal();
		const validEntry = makeGuardBlocked();

		await journal.record(validEntry);

		// Manually append corrupt lines to the file
		const corrupt = "\nnot-valid-json\n{broken\n";
		const validLine = `${JSON.stringify(makeError())}\n`;
		await writeFile(filePath, (await readFile(filePath, "utf-8")) + corrupt + validLine);

		const result = await journal.restore();

		// Should have the first valid entry and the last valid entry
		expect(result.entries).toHaveLength(2);
		expect(result.entries[0]).toEqual(jsonRoundtrip(validEntry));
		expect(result.entries[1]).toEqual(jsonRoundtrip(makeError()));

		// Corrupt lines are reported with line numbers and truncated content
		expect(result.corruptLines).toHaveLength(2);
		expect(result.corruptLines[0]?.raw).toBe("not-valid-json");
		expect(result.corruptLines[1]?.raw).toBe("{broken");
		expect(result.corruptLines[0]?.lineNumber).toBeGreaterThan(0);
	});

	it("restore() returns empty result for non-existent file", async () => {
		const nonExistentPath = join(tmpDir, "does-not-exist.jsonl");
		const journal = FileJournal.create({ filePath: nonExistentPath });

		const result = await journal.restore();

		expect(result.entries).toEqual([]);
		expect(result.corruptLines).toEqual([]);
	});

	it("restore() returns empty result for empty file", async () => {
		await writeFile(filePath, "");
		const journal = createJournal();

		const result = await journal.restore();

		expect(result.entries).toEqual([]);
		expect(result.corruptLines).toEqual([]);
	});

	it("restore() re-throws non-ENOENT filesystem errors", async () => {
		// Point at a directory instead of a file to trigger EISDIR
		const journal = FileJournal.create({ filePath: tmpDir });

		await expect(journal.restore()).rejects.toThrow();
	});

	it("close() is idempotent (calling multiple times does not throw)", async () => {
		const journal = createJournal();
		await journal.record(makeGuardBlocked());

		await journal.close();
		await journal.close();
		await journal.close();

		// No error thrown
	});

	it("record() after close() rejects", async () => {
		const journal = createJournal();
		await journal.record(makeGuardBlocked());

		await journal.close();

		await expect(journal.record(makeError())).rejects.toThrow(/closed/i);
	});

	it("record() wraps filesystem errors with context", async () => {
		const badPath = join(tmpDir, "nonexistent-dir", "journal.jsonl");
		const journal = FileJournal.create({ filePath: badPath });

		await expect(journal.record(makeGuardBlocked())).rejects.toThrow(/FileJournal write/);
	});

	it("handles all 8 JournalEntry variants correctly in serialization", async () => {
		const journal = createJournal();
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

		const result = await journal.restore();
		expect(result.entries).toHaveLength(8);
		expect(result.entries).toEqual(variants.map((e) => jsonRoundtrip(e)));
		expect(result.corruptLines).toHaveLength(0);
	});

	it("multiple sequential writes produce correct JSONL format", async () => {
		const journal = createJournal();

		await journal.record(makeGuardBlocked(100));
		await journal.record(makeError(200));
		await journal.record(makePositionOpened(300));

		const content = await readFile(filePath, "utf-8");

		// File should end with newline
		expect(content.endsWith("\n")).toBe(true);

		// Each non-empty line should be valid JSON
		const lines = content.split("\n").filter((l) => l.length > 0);
		expect(lines).toHaveLength(3);

		for (const line of lines) {
			expect(() => JSON.parse(line)).not.toThrow();
		}

		// Lines should parse to correct types
		expect(JSON.parse(lines[0] ?? "").type).toBe("guard_blocked");
		expect(JSON.parse(lines[1] ?? "").type).toBe("error");
		expect(JSON.parse(lines[2] ?? "").type).toBe("position_opened");
	});

	it("restore() after close() still works (reads existing file)", async () => {
		const journal = createJournal();
		await journal.record(makeGuardBlocked());
		await journal.close();

		const result = await journal.restore();
		expect(result.entries).toHaveLength(1);
	});

	it("record() returns a resolved Promise (async contract)", async () => {
		const journal = createJournal();
		const result = journal.record(makeGuardBlocked());

		expect(result).toBeInstanceOf(Promise);
		await expect(result).resolves.toBeUndefined();
	});

	it("close() drains pending writes (BUG-6)", async () => {
		const journal = createJournal();

		// Fire record without awaiting
		const recordPromise = journal.record(makeGuardBlocked(1000));
		// Immediately close
		await journal.close();
		// Ensure the record promise also settles
		await recordPromise.catch(() => {});

		const content = await readFile(filePath, "utf-8");
		const lines = content.split("\n").filter((l) => l.length > 0);
		expect(lines).toHaveLength(1);
	});

	it("concurrent writes produce zero corrupt lines (HARD-25)", async () => {
		const journal = createJournal();
		const writes: Promise<void>[] = [];

		for (let i = 0; i < 20; i++) {
			writes.push(journal.record(makeGuardBlocked(`guard-${i}`, i * 1000)));
		}

		await Promise.all(writes);

		const result = await journal.restore();
		expect(result.entries).toHaveLength(20);
		expect(result.corruptLines).toHaveLength(0);
	});
});
