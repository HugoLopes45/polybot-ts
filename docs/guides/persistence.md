# Persistence

Record strategy decisions with MemoryJournal or FileJournal.

## Choosing a Journal

| Feature | MemoryJournal | FileJournal |
|---------|:---:|:---:|
| Persistence across restarts | No | Yes |
| Setup required | None | File path |
| Performance | Fastest | Fast (async append) |
| Crash recovery | No | Yes (`restore()`) |
| Corrupt line detection | N/A | Yes |
| File rotation | N/A | Optional |
| Use case | Testing, backtesting | Production |

## MemoryJournal

In-memory append-only journal — ideal for tests and backtests:

```typescript
import { MemoryJournal } from "@polybot/sdk";

const journal = new MemoryJournal();

await journal.record({
	type: "order_submit",
	orderId: clientOrderId("order-1"),
	timestamp: Date.now(),
});

const entries = journal.entries();
// entries: readonly JournalEntry[]
```

## FileJournal

JSONL-based persistent journal. Each entry is appended as one JSON line:

```typescript
import { FileJournal } from "@polybot/sdk";

const journal = FileJournal.create({
	filePath: "./journal.jsonl",
});

await journal.record(entry);
```

## Crash Recovery with restore()

On restart, restore entries from the JSONL file. Corrupt lines (e.g., from a mid-write crash) are reported separately:

```typescript
const result = await journal.restore();

const { entries, corruptLines } = result;

if (corruptLines.length > 0) {
	console.warn(`${corruptLines.length} corrupt lines detected:`);
	for (const line of corruptLines) {
		console.warn(`  Line ${line.lineNumber}: ${line.raw}`);
	}
}

// Rebuild state from valid entries
for (const entry of entries) {
	// Process recovered journal entries
}
```

## File Rotation

Prevent unbounded journal growth with size-based rotation:

```typescript
const journal = FileJournal.create({
	filePath: "./journal.jsonl",
	maxFileSizeBytes: 10_000_000, // 10 MB
	maxFiles: 5, // Keep 5 rotated files
});
```

When the file exceeds `maxFileSizeBytes`, it is renamed to `journal.jsonl.1` (and older files are shifted). Up to `maxFiles` rotated files are kept.

## Wiring into StrategyBuilder

```typescript
import { StrategyBuilder, FileJournal } from "@polybot/sdk";

const strategy = StrategyBuilder.create()
	.withDetector(detector)
	.withExecutor(executor)
	.withJournal(FileJournal.create({ filePath: "./strategy.jsonl" }))
	.build();
```

The strategy automatically records tick decisions, order submissions, fills, and exit events to the journal.
