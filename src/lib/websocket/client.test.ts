import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { isOk } from "../../shared/result.js";
import { WsClient } from "./client.js";
import type { WsConfig } from "./types.js";

describe("WsClient", () => {
	let wss: WebSocketServer;
	let port: number;

	function testConfig(overrides?: Partial<WsConfig>): WsConfig {
		return {
			url: `ws://127.0.0.1:${port}`,
			pingIntervalMs: 30_000,
			pongTimeoutMs: 5_000,
			...overrides,
		};
	}

	beforeEach(async () => {
		wss = new WebSocketServer({ port: 0 });
		const addr = wss.address();
		port = typeof addr === "object" ? addr.port : 0;
	});

	afterEach(async () => {
		wss.close();
		await new Promise((resolve) => setTimeout(resolve, 50));
	});

	it("state starts as closed before connect", () => {
		const client = new WsClient(testConfig());
		expect(client.getState()).toBe("closed");
	});

	it("connect resolves and state becomes open", async () => {
		const client = new WsClient(testConfig());
		await client.connect();
		expect(client.getState()).toBe("open");
		client.close();
	});

	it("send delivers a message and receives echo", async () => {
		wss.on("connection", (ws) => {
			ws.on("message", (data) => {
				ws.send(data.toString());
			});
		});

		const client = new WsClient(testConfig());
		await client.connect();

		const received: string[] = [];
		client.onMessage((data) => received.push(data));

		const result = client.send("hello");
		expect(isOk(result)).toBe(true);

		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(received).toEqual(["hello"]);
		client.close();
	});

	it("close transitions state to closed", async () => {
		const client = new WsClient(testConfig());
		await client.connect();
		expect(client.getState()).toBe("open");

		client.close();
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(client.getState()).toBe("closed");
	});

	it("onMessage receives server-pushed messages", async () => {
		wss.on("connection", (ws) => {
			ws.send("server-push-1");
			ws.send("server-push-2");
		});

		const client = new WsClient(testConfig());
		const received: string[] = [];
		client.onMessage((data) => received.push(data));

		await client.connect();
		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(received).toEqual(["server-push-1", "server-push-2"]);
		client.close();
	});

	it("send when not connected returns err", () => {
		const client = new WsClient(testConfig());
		const result = client.send("hello");
		expect(isOk(result)).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("NETWORK_ERROR");
		}
	});

	it("connect rejects when already open", async () => {
		const client = new WsClient(testConfig());
		await client.connect();
		await expect(client.connect()).rejects.toThrow("already connecting or open");
		client.close();
	});
});
