import { describe, expect, it } from "vitest";
import type { WsState } from "../lib/websocket/types.js";
import { NetworkError } from "../shared/errors.js";
import type { TradingError } from "../shared/errors.js";
import type { Result } from "../shared/result.js";
import { err, ok } from "../shared/result.js";
import { FakeClock } from "../shared/time.js";
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
		this.closeHandler?.(1000, "closing");
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

function bookUpdateJson(ts = 1000): string {
	return JSON.stringify({
		type: "book_update",
		conditionId: "cond-1",
		bids: [{ price: "0.50", size: "100" }],
		asks: [],
		timestampMs: ts,
	});
}

describe("WsManager", () => {
	it("subscribe adds subscription and sends subscribe message", async () => {
		const client = new StubWsClient();
		const manager = new WsManager(client);
		await manager.connect();

		manager.subscribe({ channel: "book", assets: ["cond-1"] });

		expect(client.sent).toHaveLength(1);
		const msg = JSON.parse(client.sent[0] ?? "");
		expect(msg).toEqual({ action: "subscribe", channel: "book", assets: ["cond-1"] });
	});

	it("unsubscribe removes subscription", async () => {
		const client = new StubWsClient();
		const manager = new WsManager(client);
		await manager.connect();

		manager.subscribe({ channel: "book", assets: ["cond-1"] });
		manager.unsubscribe("book");

		expect(client.sent).toHaveLength(2);
		const msg = JSON.parse(client.sent[1] ?? "");
		expect(msg).toEqual({ action: "unsubscribe", channel: "book" });
	});

	it("drain returns buffered messages and clears buffer", async () => {
		const client = new StubWsClient();
		const manager = new WsManager(client);
		await manager.connect();

		client.simulateMessage(bookUpdateJson());
		const messages = manager.drain();

		expect(messages).toHaveLength(1);
		expect(messages[0]?.type).toBe("book_update");
		expect(manager.drain()).toHaveLength(0);
	});

	it("drain returns empty array when no messages", async () => {
		const client = new StubWsClient();
		const manager = new WsManager(client);
		await manager.connect();

		expect(manager.drain()).toEqual([]);
	});

	it("incoming messages are buffered for drain", async () => {
		const client = new StubWsClient();
		const manager = new WsManager(client);
		await manager.connect();

		client.simulateMessage(bookUpdateJson(1000));
		client.simulateMessage(bookUpdateJson(2000));

		const messages = manager.drain();
		expect(messages).toHaveLength(2);
	});

	it("generation counter increments on reconnect", async () => {
		const client = new StubWsClient();
		const manager = new WsManager(client);
		await manager.connect();

		const gen1 = manager.generation;
		await manager.reconnect();
		const gen2 = manager.generation;

		expect(gen2).toBe(gen1 + 1);
	});

	it("messages from old generation are discarded after reconnect", async () => {
		const client = new StubWsClient();
		const manager = new WsManager(client);
		await manager.connect();

		// Buffer a message in generation 1
		client.simulateMessage(bookUpdateJson(1000));
		// Reconnect (increments generation, clears buffer)
		await manager.reconnect();
		// Old-generation messages should be gone
		expect(manager.drain()).toHaveLength(0);
	});

	it("subscriptions are replayed on reconnect", async () => {
		const client = new StubWsClient();
		const manager = new WsManager(client);
		await manager.connect();

		manager.subscribe({ channel: "book", assets: ["cond-1"] });
		client.sent.length = 0;

		await manager.reconnect();

		expect(client.sent).toHaveLength(1);
		const msg = JSON.parse(client.sent[0] ?? "");
		expect(msg).toEqual({ action: "subscribe", channel: "book", assets: ["cond-1"] });
	});

	it("subscribe returns err when send fails", async () => {
		const client = new StubWsClient();
		client.send = () => err(new NetworkError("not connected"));
		const manager = new WsManager(client);
		const result = manager.subscribe({ channel: "book", assets: ["cond-1"] });
		expect(result.ok).toBe(false);
	});

	it("malformed book_update without required fields is discarded", async () => {
		const client = new StubWsClient();
		const manager = new WsManager(client);
		await manager.connect();

		client.simulateMessage(JSON.stringify({ type: "book_update" }));
		expect(manager.drain()).toHaveLength(0);
	});

	it("malformed user_fill without orderId is discarded", async () => {
		const client = new StubWsClient();
		const manager = new WsManager(client);
		await manager.connect();

		client.simulateMessage(JSON.stringify({ type: "user_fill", timestampMs: 1000 }));
		expect(manager.drain()).toHaveLength(0);
	});

	it("book_update with invalid bid elements is rejected", async () => {
		const client = new StubWsClient();
		const manager = new WsManager(client);
		await manager.connect();

		client.simulateMessage(
			JSON.stringify({
				type: "book_update",
				conditionId: "cond-1",
				bids: [42],
				asks: [],
				timestampMs: 1000,
			}),
		);
		expect(manager.drain()).toHaveLength(0);
	});

	it("book_update with bid missing size field is rejected", async () => {
		const client = new StubWsClient();
		const manager = new WsManager(client);
		await manager.connect();

		client.simulateMessage(
			JSON.stringify({
				type: "book_update",
				conditionId: "cond-1",
				bids: [{ price: "0.50" }],
				asks: [],
				timestampMs: 1000,
			}),
		);
		expect(manager.drain()).toHaveLength(0);
	});

	describe("subscription key collision", () => {
		it("multiple assets on same channel are all preserved", async () => {
			const client = new StubWsClient();
			const manager = new WsManager(client);
			await manager.connect();

			manager.subscribe({ channel: "book", assets: ["cond-1"] });
			manager.subscribe({ channel: "book", assets: ["cond-2"] });
			manager.subscribe({ channel: "book", assets: ["cond-3"] });
			client.sent.length = 0;

			await manager.reconnect();

			// All 3 subscriptions should be replayed
			expect(client.sent).toHaveLength(3);
			const assets = client.sent.map((s) => JSON.parse(s).assets);
			expect(assets).toContainEqual(["cond-1"]);
			expect(assets).toContainEqual(["cond-2"]);
			expect(assets).toContainEqual(["cond-3"]);
		});

		it("unsubscribe removes all entries for a channel", async () => {
			const client = new StubWsClient();
			const manager = new WsManager(client);
			await manager.connect();

			manager.subscribe({ channel: "book", assets: ["cond-1"] });
			manager.subscribe({ channel: "book", assets: ["cond-2"] });
			manager.unsubscribe("book");
			client.sent.length = 0;

			await manager.reconnect();

			// No subscriptions should be replayed
			expect(client.sent).toHaveLength(0);
		});
	});

	describe("replay errors", () => {
		it("surfaces send failures during reconnect replay", async () => {
			const client = new StubWsClient();
			const manager = new WsManager(client);
			await manager.connect();

			manager.subscribe({ channel: "book", assets: ["cond-1"] });

			// Override send to always fail — replay uses this
			client.send = () => err(new NetworkError("send failed"));

			await manager.reconnect();

			expect(manager.replayErrors).toHaveLength(1);
			expect(manager.replayErrors[0]?.message).toBe("send failed");
		});

		it("replay errors are empty when all sends succeed", async () => {
			const client = new StubWsClient();
			const manager = new WsManager(client);
			await manager.connect();

			manager.subscribe({ channel: "book", assets: ["cond-1"] });
			await manager.reconnect();

			expect(manager.replayErrors).toHaveLength(0);
		});
	});

	describe("maxBufferSize", () => {
		it("drops oldest messages when buffer exceeds maxBufferSize", async () => {
			const client = new StubWsClient();
			const manager = new WsManager(client, { maxBufferSize: 10 });
			await manager.connect();

			for (let i = 0; i < 100; i++) {
				client.simulateMessage(bookUpdateJson(1000 + i));
			}

			const messages = manager.drain();
			expect(messages).toHaveLength(10);
			// Should contain the 10 most recent messages (timestamps 1090-1099)
			expect((messages[0] as { timestampMs: number }).timestampMs).toBe(1090);
			expect((messages[9] as { timestampMs: number }).timestampMs).toBe(1099);
		});

		it("no limit when maxBufferSize is not configured", async () => {
			const client = new StubWsClient();
			const manager = new WsManager(client);
			await manager.connect();

			for (let i = 0; i < 50; i++) {
				client.simulateMessage(bookUpdateJson(1000 + i));
			}

			expect(manager.drain()).toHaveLength(50);
		});
	});

	describe("heartbeat", () => {
		it("fresh connection is healthy", async () => {
			const client = new StubWsClient();
			const clock = new FakeClock(1000);
			const manager = new WsManager(client, { heartbeatTimeoutMs: 60_000, clock });
			await manager.connect();

			expect(manager.checkHeartbeat()).toBe("healthy");
		});

		it("message received resets timer", async () => {
			const client = new StubWsClient();
			const clock = new FakeClock(1000);
			const manager = new WsManager(client, { heartbeatTimeoutMs: 60_000, clock });
			await manager.connect();

			clock.advance(50_000);
			client.simulateMessage(bookUpdateJson());

			clock.advance(15_000);
			expect(manager.checkHeartbeat()).toBe("healthy");

			clock.advance(50_000);
			expect(manager.checkHeartbeat()).toBe("stale");
		});

		it("silence exceeds timeout returns stale", async () => {
			const client = new StubWsClient();
			const clock = new FakeClock(1000);
			const manager = new WsManager(client, { heartbeatTimeoutMs: 60_000, clock });
			await manager.connect();

			client.simulateMessage(bookUpdateJson());
			clock.advance(61_000);

			expect(manager.checkHeartbeat()).toBe("stale");
		});

		it("default timeout is 60s (59s=healthy, 61s=stale)", async () => {
			const client = new StubWsClient();
			const clock = new FakeClock(1000);
			const manager = new WsManager(client, { heartbeatTimeoutMs: 60_000, clock });
			await manager.connect();

			client.simulateMessage(bookUpdateJson());

			clock.advance(59_000);
			expect(manager.checkHeartbeat()).toBe("healthy");

			clock.advance(2_000);
			expect(manager.checkHeartbeat()).toBe("stale");
		});

		it("custom timeout respected", async () => {
			const client = new StubWsClient();
			const clock = new FakeClock(1000);
			const manager = new WsManager(client, { heartbeatTimeoutMs: 30_000, clock });
			await manager.connect();

			client.simulateMessage(bookUpdateJson());

			clock.advance(31_000);
			expect(manager.checkHeartbeat()).toBe("stale");

			clock.set(1000);
			client.simulateMessage(bookUpdateJson());
			clock.advance(20_000);
			expect(manager.checkHeartbeat()).toBe("healthy");
		});

		it("reconnect resets timer", async () => {
			const client = new StubWsClient();
			const clock = new FakeClock(1000);
			const manager = new WsManager(client, { heartbeatTimeoutMs: 60_000, clock });
			await manager.connect();

			client.simulateMessage(bookUpdateJson());
			clock.advance(30_000);

			await manager.reconnect();

			clock.advance(50_000);
			expect(manager.checkHeartbeat()).toBe("healthy");

			clock.advance(20_000);
			expect(manager.checkHeartbeat()).toBe("stale");
		});

		it("no timeout configured = always healthy", async () => {
			const client = new StubWsClient();
			const clock = new FakeClock(1000);
			const manager = new WsManager(client, { clock });
			await manager.connect();

			clock.advance(1_000_000_000);
			expect(manager.checkHeartbeat()).toBe("healthy");
		});
	});
});
