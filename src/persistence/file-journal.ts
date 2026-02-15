/**
 * FileJournal -- JSONL-based persistent journal for strategy decisions.
 *
 * Appends one JSON object per line to a file. Supports restore() to
 * read entries back, reporting corrupt lines instead of silently dropping them.
 */

import { appendFile, readFile, rename } from "node:fs/promises";
import { stat } from "node:fs/promises";
import type { Journal, JournalEntry } from "../strategy/journal.js";

/** Configuration for creating a FileJournal instance. */
export interface FileJournalConfig {
	readonly filePath: string;
	readonly maxFileSizeBytes?: number;
	readonly maxFiles?: number;
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
	private readonly config: FileJournalConfig;
	private closed = false;
	private writeQueue: Promise<void> = Promise.resolve();
	private _writeErrors: Error[] = [];

	private constructor(config: FileJournalConfig) {
		this.config = config;
	}

	private get filePath(): string {
		return this.config.filePath;
	}

	private get maxFileSizeBytes(): number | undefined {
		return this.config.maxFileSizeBytes;
	}

	private get maxFiles(): number {
		if (this.config.maxFiles !== undefined) {
			return this.config.maxFiles;
		}
		return this.config.maxFileSizeBytes !== undefined ? 5 : 0;
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

	/** Marks the journal as closed, draining any pending writes first. */
	async close(): Promise<void> {
		this.closed = true;
		await this.writeQueue.catch(() => {});
	}

	/** Waits for all pending writes to complete. */
	async flush(): Promise<void> {
		await this.writeQueue.catch(() => {});
	}

	/** Returns the last 10 write errors. */
	writeErrors(): readonly Error[] {
		return this._writeErrors;
	}

	private async writeOnce(line: string): Promise<void> {
		try {
			if (this.maxFileSizeBytes !== undefined && this.maxFileSizeBytes > 0) {
				await this.rotateIfNeeded();
			}
			await appendFile(this.filePath, line, "utf-8");
		} catch (err: unknown) {
			const code = isNodeError(err) ? err.code : "UNKNOWN";
			const msg = err instanceof Error ? err.message : String(err);
			const error = new Error(`FileJournal write to ${this.filePath} failed: [${code}] ${msg}`);
			this._writeErrors.push(error);
			if (this._writeErrors.length > 10) {
				this._writeErrors.shift();
			}
			throw error;
		}
	}

	private async rotateIfNeeded(): Promise<void> {
		const maxSize = this.maxFileSizeBytes;
		if (maxSize === undefined) {
			return;
		}
		try {
			const stats = await stat(this.filePath);
			if (stats.size < maxSize) {
				return;
			}
		} catch (err: unknown) {
			if (isNodeError(err) && err.code === "ENOENT") {
				return;
			}
			throw err;
		}

		await this.rotate();
	}

	private async rotate(): Promise<void> {
		for (let i = this.maxFiles - 1; i >= 1; i--) {
			const src = `${this.filePath}.${i}`;
			const dst = `${this.filePath}.${i + 1}`;
			try {
				await rename(src, dst);
			} catch (err: unknown) {
				if (!isNodeError(err) || err.code !== "ENOENT") {
					throw err;
				}
			}
		}

		try {
			await rename(this.filePath, `${this.filePath}.1`);
		} catch (err: unknown) {
			if (!isNodeError(err) || err.code !== "ENOENT") {
				throw err;
			}
		}
	}
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
	return err instanceof Error && "code" in err;
}
