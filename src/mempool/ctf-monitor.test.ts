import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WsState } from "../lib/websocket/types.js";
import { NetworkError } from "../shared/errors.js";
import type { TradingError } from "../shared/errors.js";
import type { Result } from "../shared/result.js";
import { err, ok } from "../shared/result.js";
import { FakeClock } from "../shared/time.js";
import { CtfMempoolMonitor } from "./ctf-monitor.js";
import type { MempoolConfig, MempoolEvent } from "./types.js";

class StubWsClient {
	private readonly msgHandlers: ((data: string) => void)[] = [];
	private readonly closeHandlers: ((code: number, reason: string) => void)[] = [];
	private readonly errorHandlers: ((error: Error) => void)[] = [];
	readonly sent: string[] = [];
	private _closed = false;

	connect(): Promise<void> {
		return Promise.resolve();
	}

	send(data: string): Result<void, TradingError> {
		this.sent.push(data);
		return ok(undefined);
	}

	close(): void {
		this._closed = true;
	}

	getState(): WsState {
		return "open";
	}

	onMessage(h: (data: string) => void): void {
		this.msgHandlers.push(h);
	}

	onClose(_h: (code: number, reason: string) => void): void {
		this.closeHandlers.push(_h);
	}

	onError(_h: (error: Error) => void): void {
		this.errorHandlers.push(_h);
	}

	get closed(): boolean {
		return this._closed;
	}

	emit(data: string): void {
		for (const h of this.msgHandlers) {
			h(data);
		}
	}
}

function makeNotification(txHash: string): string {
	return JSON.stringify({
		jsonrpc: "2.0",
		method: "eth_subscription",
		params: {
			subscription: "0xabc123",
			result: txHash,
		},
	});
}

describe("CtfMempoolMonitor", () => {
	let clock: FakeClock;
	let config: MempoolConfig;

	beforeEach(() => {
		clock = new FakeClock(1_000_000);
		config = {
			rpcWsUrl: "ws://localhost:8546",
			clock,
		};
	});

	it("connect() sends eth_subscribe after connecting", async () => {
		const ws = new StubWsClient();
		const monitor = new CtfMempoolMonitor(config, ws);

		const result = await monitor.connect();
		expect(result.ok).toBe(true);
		expect(ws.sent).toHaveLength(1);

		const parsed = JSON.parse(ws.sent[0] ?? "{}");
		expect(parsed).toEqual({
			jsonrpc: "2.0",
			id: 1,
			method: "eth_subscribe",
			params: ["newPendingTransactions"],
		});
	});

	it("emits whale_detected for valid tx hash notification", async () => {
		const ws = new StubWsClient();
		const monitor = new CtfMempoolMonitor(config, ws);
		await monitor.connect();

		const events: MempoolEvent[] = [];
		monitor.onEvent((e) => events.push(e));

		const txHash = "0xabc123def456";
		ws.emit(makeNotification(txHash));

		expect(events).toHaveLength(1);
		expect(events[0]).toEqual({
			type: "whale_detected",
			txHash,
			from: "pending",
			method: "pending_tx",
			timestamp: 1_000_000,
		});
	});

	it("emits merge_signal for tx hash ending with merge selector", async () => {
		const ws = new StubWsClient();
		const monitor = new CtfMempoolMonitor(config, ws);
		await monitor.connect();

		const events: MempoolEvent[] = [];
		monitor.onEvent((e) => events.push(e));

		const txHash = "0x000000000000000000000000000000000000merge";
		ws.emit(makeNotification(txHash));

		expect(events).toHaveLength(1);
		expect(events[0]?.type).toBe("merge_signal");
		expect(events[0]?.txHash).toBe(txHash);
	});

	it("emits redeem_signal for tx hash ending with redeem selector", async () => {
		const ws = new StubWsClient();
		const monitor = new CtfMempoolMonitor(config, ws);
		await monitor.connect();

		const events: MempoolEvent[] = [];
		monitor.onEvent((e) => events.push(e));

		const txHash = "0x00000000000000000000000000000000redeem";
		ws.emit(makeNotification(txHash));

		expect(events).toHaveLength(1);
		expect(events[0]?.type).toBe("redeem_signal");
		expect(events[0]?.txHash).toBe(txHash);
	});

	it("onEvent unsubscribe stops receiving events", async () => {
		const ws = new StubWsClient();
		const monitor = new CtfMempoolMonitor(config, ws);
		await monitor.connect();

		const events: MempoolEvent[] = [];
		const unsub = monitor.onEvent((e) => events.push(e));

		ws.emit(makeNotification("0xfirst"));
		expect(events).toHaveLength(1);

		unsub();
		ws.emit(makeNotification("0xsecond"));
		expect(events).toHaveLength(1);
	});

	it("stats counts increment correctly", async () => {
		const ws = new StubWsClient();
		const monitor = new CtfMempoolMonitor(config, ws);
		await monitor.connect();

		expect(monitor.stats).toEqual({
			txSeen: 0,
			ctfTxSeen: 0,
			eventsEmitted: 0,
			parseErrors: 0,
		});

		monitor.onEvent(() => {});
		ws.emit(makeNotification("0xhash1"));
		ws.emit(makeNotification("0xhash2"));

		expect(monitor.stats.txSeen).toBe(2);
		expect(monitor.stats.eventsEmitted).toBe(2);
	});

	it("ctfTxSeen counts merge and redeem signals separately", async () => {
		const ws = new StubWsClient();
		const monitor = new CtfMempoolMonitor(config, ws);
		await monitor.connect();

		monitor.onEvent(() => {});
		ws.emit(makeNotification("0x000000000000000000000000000000000000merge"));
		ws.emit(makeNotification("0x00000000000000000000000000000000redeem"));
		ws.emit(makeNotification("0xregulartx"));

		expect(monitor.stats.ctfTxSeen).toBe(2);
		expect(monitor.stats.txSeen).toBe(3);
	});

	it("disconnect closes the wsClient", async () => {
		const ws = new StubWsClient();
		const monitor = new CtfMempoolMonitor(config, ws);
		await monitor.connect();

		monitor.disconnect();
		expect(ws.closed).toBe(true);
	});

	it("ignores malformed JSON messages", async () => {
		const ws = new StubWsClient();
		const monitor = new CtfMempoolMonitor(config, ws);
		await monitor.connect();

		const events: MempoolEvent[] = [];
		monitor.onEvent((e) => events.push(e));

		ws.emit("not valid json");
		ws.emit("");
		ws.emit("{}");

		expect(events).toHaveLength(0);
		expect(monitor.stats.txSeen).toBe(0);
	});

	it("ignores notifications without valid tx hash", async () => {
		const ws = new StubWsClient();
		const monitor = new CtfMempoolMonitor(config, ws);
		await monitor.connect();

		const events: MempoolEvent[] = [];
		monitor.onEvent((e) => events.push(e));

		ws.emit(
			JSON.stringify({
				jsonrpc: "2.0",
				method: "eth_subscription",
				params: { subscription: "0xabc", result: 12345 },
			}),
		);

		expect(events).toHaveLength(0);
	});

	it("connect returns error when wsClient connect rejects", async () => {
		const ws = new StubWsClient();
		vi.spyOn(ws, "connect").mockRejectedValueOnce(new Error("connection refused"));

		const monitor = new CtfMempoolMonitor(config, ws);
		const result = await monitor.connect();

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.message).toContain("connection refused");
		}
	});

	it("multiple handlers all receive events", async () => {
		const ws = new StubWsClient();
		const monitor = new CtfMempoolMonitor(config, ws);
		await monitor.connect();

		const events1: MempoolEvent[] = [];
		const events2: MempoolEvent[] = [];
		monitor.onEvent((e) => events1.push(e));
		monitor.onEvent((e) => events2.push(e));

		ws.emit(makeNotification("0xhash"));

		expect(events1).toHaveLength(1);
		expect(events2).toHaveLength(1);
	});

	it("uses SystemClock when no clock provided", async () => {
		const ws = new StubWsClient();
		const configNoClock: MempoolConfig = {
			rpcWsUrl: "ws://localhost:8546",
		};
		const monitor = new CtfMempoolMonitor(configNoClock, ws);
		await monitor.connect();

		const events: MempoolEvent[] = [];
		monitor.onEvent((e) => events.push(e));

		ws.emit(makeNotification("0xhash"));

		expect(events).toHaveLength(1);
		expect(events[0]?.timestamp).toBeGreaterThan(0);
	});

	it("throwing handler does not prevent other handlers from receiving event", async () => {
		const ws = new StubWsClient();
		const monitor = new CtfMempoolMonitor(config, ws);
		await monitor.connect();

		const events: MempoolEvent[] = [];
		monitor.onEvent(() => {
			throw new Error("handler boom");
		});
		monitor.onEvent((e) => events.push(e));

		ws.emit(makeNotification("0xhash"));

		expect(events).toHaveLength(1);
		expect(events[0]?.type).toBe("whale_detected");
	});

	it("stats.parseErrors increments on malformed JSON", async () => {
		const ws = new StubWsClient();
		const monitor = new CtfMempoolMonitor(config, ws);
		await monitor.connect();

		ws.emit("{bad json");
		ws.emit("not json at all");

		expect(monitor.stats.parseErrors).toBe(2);
		expect(monitor.stats.txSeen).toBe(0);
	});

	it("connect returns err when send() returns err", async () => {
		const ws = new StubWsClient();
		const sendError = new NetworkError("send failed");
		vi.spyOn(ws, "send").mockReturnValueOnce(err(sendError));

		const monitor = new CtfMempoolMonitor(config, ws);
		const result = await monitor.connect();

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.message).toBe("send failed");
		}
	});
});
