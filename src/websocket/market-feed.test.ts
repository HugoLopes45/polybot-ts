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
});
