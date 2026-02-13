/**
 * FileJournal -- JSONL-based persistent journal for strategy decisions.
 *
 * Appends one JSON object per line to a file. Supports restore() to
 * read entries back, reporting corrupt lines instead of silently dropping them.
 */

import { appendFile, readFile } from "node:fs/promises";
import type { Journal, JournalEntry } from "../strategy/journal.js";

/** Configuration for creating a FileJournal instance. */
export interface FileJournalConfig {
	readonly filePath: string;
}

/** A line in the JSONL file that could not be parsed as valid JSON. */
export interface CorruptLine {
	readonly lineNumber: number;
	readonly raw: string;
}

/** Result of restoring journal entries from a JSONL file. */
export interface RestoreResult {
	readonly entries: readonly unknown[];
	readonly corruptLines: readonly CorruptLine[];
}

export class FileJournal implements Journal {
	private readonly filePath: string;
	private closed = false;
	private writeQueue: Promise<void> = Promise.resolve();

	private constructor(config: FileJournalConfig) {
		this.filePath = config.filePath;
	}

	/**
	 * Creates a new FileJournal writing to the specified file path.
	 * @param config - Configuration with the target file path
	 */
	static create(config: FileJournalConfig): FileJournal {
		return new FileJournal(config);
	}

	async record(event: JournalEntry): Promise<void> {
		if (this.closed) {
			throw new Error("FileJournal is closed");
		}
		const line = `${JSON.stringify(event)}\n`;
		const prev = this.writeQueue;
		this.writeQueue = prev.catch(() => {}).then(() => this.writeOnce(line));
		await this.writeQueue;
	}

	/**
	 * Reads and parses all journal entries from the JSONL file.
	 * Corrupt lines are collected separately rather than silently dropped.
	 */
	async restore(): Promise<RestoreResult> {
		let content: string;
		try {
			content = await readFile(this.filePath, "utf-8");
		} catch (err: unknown) {
			if (isNodeError(err) && err.code === "ENOENT") {
				return { entries: [], corruptLines: [] };
			}
			throw err;
		}

		if (content.length === 0) {
			return { entries: [], corruptLines: [] };
		}

		const lines = content.split("\n");
		const entries: unknown[] = [];
		const corruptLines: CorruptLine[] = [];

		for (let i = 0; i < lines.length; i++) {
			const trimmed = lines[i]?.trim() ?? "";
			if (trimmed.length === 0) {
				continue;
			}
			try {
				entries.push(JSON.parse(trimmed));
			} catch {
				corruptLines.push({ lineNumber: i + 1, raw: trimmed.slice(0, 200) });
			}
		}

		return { entries, corruptLines };
	}

	/** Marks the journal as closed, rejecting subsequent writes. */
	async close(): Promise<void> {
		this.closed = true;
	}

	private async writeOnce(line: string): Promise<void> {
		try {
			await appendFile(this.filePath, line, "utf-8");
		} catch (err: unknown) {
			const code = isNodeError(err) ? err.code : "UNKNOWN";
			const msg = err instanceof Error ? err.message : String(err);
			throw new Error(`FileJournal write to ${this.filePath} failed: [${code}] ${msg}`);
		}
	}
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
	return err instanceof Error && "code" in err;
}
