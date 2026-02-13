import { describe, expect, it } from "vitest";
import type { WsState } from "../lib/websocket/types.js";
import type { TradingError } from "../shared/errors.js";
import { conditionId } from "../shared/identifiers.js";
import type { Result } from "../shared/result.js";
import { ok } from "../shared/result.js";
import { MultiMarketManager } from "./multi-market.js";
import { WsManager } from "./ws-manager.js";

class StubWsClient {
	private messageHandler: ((data: string) => void) | null = null;
	private closeHandler: ((code: number, reason: string) => void) | null = null;
	private state: WsState = "closed";
	readonly sent: string[] = [];

	async connect(): Promise<void> {
		this.state = "open";
	}

	send(data: string): Result<void, TradingError> {
		this.sent.push(data);
		return ok(undefined);
	}

	close(): void {
		this.state = "closed";
		this.closeHandler?.(0, "closed");
	}

	getState(): WsState {
		return this.state;
	}

	onMessage(h: (data: string) => void): void {
		this.messageHandler = h;
	}

	onClose(h: (code: number, reason: string) => void): void {
		this.closeHandler = h;
	}

	onError(_h: (error: Error) => void): void {}

	simulateMessage(data: string): void {
		this.messageHandler?.(data);
	}
}

function bookUpdateJson(conditionId: string, ts = 1000): string {
	return JSON.stringify({
		type: "book_update",
		conditionId,
		bids: [{ price: "0.50", size: "100" }],
		asks: [{ price: "0.55", size: "50" }],
		timestampMs: ts,
	});
}

describe("MultiMarketManager", () => {
	it("addMarket subscribes to market book channel", async () => {
		const client = new StubWsClient();
		const wsManager = new WsManager(client);
		await wsManager.connect();
		const mmManager = new MultiMarketManager(wsManager);

		const condId = conditionId("cond-1");
		const result = mmManager.addMarket(condId);

		expect(result.ok).toBe(true);
		expect(client.sent).toHaveLength(1);
		const msg = JSON.parse(client.sent[0] ?? "");
		expect(msg).toEqual({ action: "subscribe", channel: "book", assets: ["cond-1"] });
	});

	it("removeMarket only unsubscribes when no markets remain", async () => {
		const client = new StubWsClient();
		const wsManager = new WsManager(client);
		await wsManager.connect();
		const mmManager = new MultiMarketManager(wsManager);

		const condId1 = conditionId("cond-1");
		const condId2 = conditionId("cond-2");
		mmManager.addMarket(condId1);
		mmManager.addMarket(condId2);
		client.sent.length = 0;

		mmManager.removeMarket(condId1);

		// Should NOT unsubscribe — condId2 is still active
		expect(client.sent).toHaveLength(0);

		mmManager.removeMarket(condId2);

		// Now should unsubscribe — no markets left
		expect(client.sent).toHaveLength(1);
		const msg = JSON.parse(client.sent[0] ?? "");
		expect(msg).toEqual({ action: "unsubscribe", channel: "book" });
	});

	it("processUpdates applies deltas to books", async () => {
		const client = new StubWsClient();
		const wsManager = new WsManager(client);
		await wsManager.connect();
		const mmManager = new MultiMarketManager(wsManager);

		const condId = conditionId("cond-1");
		mmManager.addMarket(condId);
		client.simulateMessage(bookUpdateJson("cond-1", 1000));

		mmManager.processUpdates();

		const book = mmManager.getBook(condId);
		expect(book).not.toBeNull();
		expect(book?.bids).toHaveLength(1);
		expect(book?.bids[0]?.price.toString()).toBe("0.5");
		expect(book?.bids[0]?.size.toString()).toBe("100");
	});

	it("multiple markets routed correctly", async () => {
		const client = new StubWsClient();
		const wsManager = new WsManager(client);
		await wsManager.connect();
		const mmManager = new MultiMarketManager(wsManager);

		const condId1 = conditionId("cond-1");
		const condId2 = conditionId("cond-2");
		mmManager.addMarket(condId1);
		mmManager.addMarket(condId2);

		client.simulateMessage(bookUpdateJson("cond-1", 1000));
		client.simulateMessage(bookUpdateJson("cond-2", 2000));

		mmManager.processUpdates();

		const book1 = mmManager.getBook(condId1);
		const book2 = mmManager.getBook(condId2);

		expect(book1?.timestampMs).toBe(1000);
		expect(book2?.timestampMs).toBe(2000);
	});

	it("unknown market updates ignored without creating phantom books", async () => {
		const client = new StubWsClient();
		const wsManager = new WsManager(client);
		await wsManager.connect();
		const mmManager = new MultiMarketManager(wsManager);

		mmManager.addMarket(conditionId("cond-1"));
		client.simulateMessage(bookUpdateJson("unknown-cond", 1000));

		expect(() => mmManager.processUpdates()).not.toThrow();
		expect(mmManager.getBook(conditionId("unknown-cond"))).toBeNull();
		expect(mmManager.activeMarkets()).toHaveLength(1);
	});

	it("removed market updates do not create phantom books", async () => {
		const client = new StubWsClient();
		const wsManager = new WsManager(client);
		await wsManager.connect();
		const mmManager = new MultiMarketManager(wsManager);

		const condId = conditionId("cond-1");
		mmManager.addMarket(condId);
		client.simulateMessage(bookUpdateJson("cond-1", 1000));
		mmManager.processUpdates();
		expect(mmManager.getBook(condId)).not.toBeNull();

		mmManager.removeMarket(condId);
		client.simulateMessage(bookUpdateJson("cond-1", 2000));
		mmManager.processUpdates();
		expect(mmManager.getBook(condId)).toBeNull();
	});

	it("malformed book update does not crash the update loop", async () => {
		const client = new StubWsClient();
		const wsManager = new WsManager(client);
		await wsManager.connect();
		const mmManager = new MultiMarketManager(wsManager);

		const condId1 = conditionId("cond-1");
		const condId2 = conditionId("cond-2");
		mmManager.addMarket(condId1);
		mmManager.addMarket(condId2);

		// Inject a malformed update between two valid ones
		client.simulateMessage(bookUpdateJson("cond-1", 1000));
		client.simulateMessage(
			JSON.stringify({
				type: "book_update",
				conditionId: "cond-1",
				bids: [{ price: "invalid", size: "NaN" }],
				asks: [],
				timestampMs: 1500,
			}),
		);
		client.simulateMessage(bookUpdateJson("cond-2", 2000));

		expect(() => mmManager.processUpdates()).not.toThrow();
		// Second valid update should still have been processed
		expect(mmManager.getBook(condId2)).not.toBeNull();
	});

	it("getBook returns null before data", async () => {
		const client = new StubWsClient();
		const wsManager = new WsManager(client);
		await wsManager.connect();
		const mmManager = new MultiMarketManager(wsManager);

		mmManager.addMarket(conditionId("cond-1"));

		const book = mmManager.getBook(conditionId("cond-1"));
		expect(book).toBeNull();
	});

	it("activeMarkets returns current set", async () => {
		const client = new StubWsClient();
		const wsManager = new WsManager(client);
		await wsManager.connect();
		const mmManager = new MultiMarketManager(wsManager);

		const condId1 = conditionId("cond-1");
		const condId2 = conditionId("cond-2");
		mmManager.addMarket(condId1);
		mmManager.addMarket(condId2);

		const markets = mmManager.activeMarkets();

		expect(markets).toHaveLength(2);
		expect(markets).toContain(condId1);
		expect(markets).toContain(condId2);
	});

	it("remove non-existent market is no-op", async () => {
		const client = new StubWsClient();
		const wsManager = new WsManager(client);
		await wsManager.connect();
		const mmManager = new MultiMarketManager(wsManager);

		expect(() => mmManager.removeMarket(conditionId("non-existent"))).not.toThrow();
		expect(client.sent).toHaveLength(0);
	});

	it("adding duplicate market is no-op", async () => {
		const client = new StubWsClient();
		const wsManager = new WsManager(client);
		await wsManager.connect();
		const mmManager = new MultiMarketManager(wsManager);

		const condId = conditionId("cond-1");
		mmManager.addMarket(condId);
		client.sent.length = 0;

		const result = mmManager.addMarket(condId);

		expect(result.ok).toBe(true);
		expect(client.sent).toHaveLength(0);
	});
});
