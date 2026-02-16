# Persistence

MemoryJournal and FileJournal for strategy recording.

## Memory Journal

```typescript
import { MemoryJournal } from "@polybot/sdk";

const journal = new MemoryJournal();

await journal.record({
  type: "order_submit",
  orderId: clientOrderId("order-1"),
  timestamp: Date.now(),
});

const entries = journal.entries();
```

## File Journal

```typescript
import { FileJournal } from "@polybot/sdk";

const journal = FileJournal.create({
  filePath: "./journal.jsonl",
});

await journal.record(entry);
```

## Restore from File

```typescript
const result = await journal.restore();

// Result contains parsed entries and any corrupt lines
const { entries, corruptLines } = result;

if (corruptLines.length > 0) {
  // Handle corrupt journal entries
}
```

## File Rotation

```typescript
const journal = FileJournal.create({
  filePath: "./journal.jsonl",
  maxFileSizeBytes: 10_000_000, // 10MB
  maxFiles: 5, // Keep 5 rotated files
});
```
