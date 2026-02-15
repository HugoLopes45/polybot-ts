import { describe, expect, it } from "vitest";
import { ConnectivityWatchdog } from "../lifecycle/watchdog.js";
import { Decimal } from "../shared/decimal.js";
import { conditionId, exchangeOrderId } from "../shared/identifiers.js";
import type { ConditionId } from "../shared/identifiers.js";
import { Duration, FakeClock } from "../shared/time.js";
import { MarketFeed } from "./market-feed.js";
import type { BookUpdate, WsMessage } from "./types.js";

function makeBookUpdate(cid: ConditionId, ts = 1000): BookUpdate {
	return {
		type: "book_update",
		conditionId: cid,
		bids: [{ price: "0.50", size: "100" }],
		asks: [{ price: "0.55", size: "200" }],
		timestampMs: ts,
	};
}

describe("MarketFeed", () => {
	function setup() {
		const clock = new FakeClock(1000);
		const watchdog = new ConnectivityWatchdog(
			{ warningMs: Duration.seconds(15), criticalMs: Duration.seconds(30) },
			clock,
		);
		const feed = new MarketFeed(watchdog);
		return { feed, watchdog, clock };
	}

	it("applies BookUpdate delta to stored orderbook", () => {
		const { feed } = setup();
		const cid = conditionId("cond-1");

		feed.processMessages([makeBookUpdate(cid)]);
		const book = feed.getBook(cid);

		expect(book).not.toBeNull();
		expect(book?.bids).toHaveLength(1);
		expect(book?.bids[0]?.price.eq(Decimal.from("0.50"))).toBe(true);
		expect(book?.bids[0]?.size.eq(Decimal.from("100"))).toBe(true);
		expect(book?.asks).toHaveLength(1);
		expect(book?.asks[0]?.price.eq(Decimal.from("0.55"))).toBe(true);
	});

	it("getBook returns null for unknown conditionId", () => {
		const { feed } = setup();
		expect(feed.getBook(conditionId("unknown"))).toBeNull();
	});

	it("getBook returns snapshot after book update applied", () => {
		const { feed } = setup();
		const cid = conditionId("cond-1");

		feed.processMessages([makeBookUpdate(cid, 1000)]);
		// Apply a second update that adds a new bid level
		feed.processMessages([
			{
				type: "book_update",
				conditionId: cid,
				bids: [{ price: "0.48", size: "50" }],
				asks: [],
				timestampMs: 2000,
			},
		]);

		const book = feed.getBook(cid);
		expect(book).not.toBeNull();
		expect(book?.bids).toHaveLength(2);
	});

	it("touches watchdog on each valid BookUpdate message", () => {
		const { feed, watchdog, clock } = setup();
		const cid = conditionId("cond-1");

		clock.advance(Duration.seconds(10));
		expect(watchdog.silenceMs()).toBe(Duration.seconds(10));

		feed.processMessages([makeBookUpdate(cid)]);
		expect(watchdog.silenceMs()).toBe(0);
	});

	it("updates timestamp from latest BookUpdate, not stale from first", () => {
		const { feed } = setup();
		const cid = conditionId("cond-1");

		feed.processMessages([makeBookUpdate(cid, 1000)]);
		expect(feed.getBook(cid)?.timestampMs).toBe(1000);

		feed.processMessages([
			{
				type: "book_update",
				conditionId: cid,
				bids: [{ price: "0.48", size: "50" }],
				asks: [],
				timestampMs: 2000,
			},
		]);
		expect(feed.getBook(cid)?.timestampMs).toBe(2000);
	});

	it("ignores non-BookUpdate messages", () => {
		const { feed, watchdog, clock } = setup();
		const messages: WsMessage[] = [
			{ type: "heartbeat", timestampMs: 1000 },
			{
				type: "user_fill",
				orderId: exchangeOrderId("ord-1"),
				filledSize: "10",
				fillPrice: "0.50",
				timestampMs: 1000,
			},
		];

		clock.advance(Duration.seconds(10));
		feed.processMessages(messages);

		// Watchdog not touched — silence unchanged
		expect(watchdog.silenceMs()).toBe(Duration.seconds(10));
		// No books stored
		expect(feed.getBook(conditionId("cond-1"))).toBeNull();
	});

	it("evicts LRU entry when maxBooks exceeded", () => {
		const clock = new FakeClock(1000);
		const watchdog = new ConnectivityWatchdog(
			{ warningMs: Duration.seconds(15), criticalMs: Duration.seconds(30) },
			clock,
		);
		const feed = new MarketFeed(watchdog, { maxBooks: 3 });

		// Add 3 books
		const cid1 = conditionId("cond-1");
		const cid2 = conditionId("cond-2");
		const cid3 = conditionId("cond-3");
		feed.processMessages([makeBookUpdate(cid1, 1000)]);
		feed.processMessages([makeBookUpdate(cid2, 1001)]);
		feed.processMessages([makeBookUpdate(cid3, 1002)]);

		expect(feed.getBook(cid1)).not.toBeNull();
		expect(feed.getBook(cid2)).not.toBeNull();
		expect(feed.getBook(cid3)).not.toBeNull();

		// Add 4th book - should evict LRU (cid1)
		const cid4 = conditionId("cond-4");
		feed.processMessages([makeBookUpdate(cid4, 1003)]);

		expect(feed.getBook(cid1)).toBeNull(); // evicted
		expect(feed.getBook(cid2)).not.toBeNull();
		expect(feed.getBook(cid3)).not.toBeNull();
		expect(feed.getBook(cid4)).not.toBeNull();
	});

	it("accessing book updates its LRU position", () => {
		const clock = new FakeClock(1000);
		const watchdog = new ConnectivityWatchdog(
			{ warningMs: Duration.seconds(15), criticalMs: Duration.seconds(30) },
			clock,
		);
		const feed = new MarketFeed(watchdog, { maxBooks: 3 });

		const cid1 = conditionId("cond-1");
		const cid2 = conditionId("cond-2");
		const cid3 = conditionId("cond-3");
		feed.processMessages([makeBookUpdate(cid1, 1000)]);
		feed.processMessages([makeBookUpdate(cid2, 1001)]);
		feed.processMessages([makeBookUpdate(cid3, 1002)]);

		// Access cid1 to update its LRU position
		feed.getBook(cid1);

		// Add new book - should evict cid2 (least recently used after access)
		const cid4 = conditionId("cond-4");
		feed.processMessages([makeBookUpdate(cid4, 1003)]);

		expect(feed.getBook(cid1)).not.toBeNull(); // still there (was accessed)
		expect(feed.getBook(cid2)).toBeNull(); // evicted (was LRU before access)
		expect(feed.getBook(cid3)).not.toBeNull();
		expect(feed.getBook(cid4)).not.toBeNull();
	});

	it("removeBook explicitly removes a book", () => {
		const { feed } = setup();
		const cid = conditionId("cond-1");

		feed.processMessages([makeBookUpdate(cid)]);
		expect(feed.getBook(cid)).not.toBeNull();

		feed.removeBook(cid);
		expect(feed.getBook(cid)).toBeNull();
	});

	it("removeBook is no-op for unknown conditionId", () => {
		const { feed } = setup();
		expect(() => feed.removeBook(conditionId("unknown"))).not.toThrow();
	});

	it("uses default maxBooks of 100 when not specified", () => {
		const clock = new FakeClock(1000);
		const watchdog = new ConnectivityWatchdog(
			{ warningMs: Duration.seconds(15), criticalMs: Duration.seconds(30) },
			clock,
		);
		const feed = new MarketFeed(watchdog);

		// Add 100 books
		for (let i = 0; i < 100; i++) {
			feed.processMessages([makeBookUpdate(conditionId(`cond-${i}`), 1000 + i)]);
		}

		// Add 101st book - should evict cond-0 (LRU)
		feed.processMessages([makeBookUpdate(conditionId("cond-100"), 2000)]);
		expect(feed.getBook(conditionId("cond-0"))).toBeNull();
	});
});
