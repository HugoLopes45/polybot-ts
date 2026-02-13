import type { WsState } from "../lib/websocket/types.js";
import type { TradingError } from "../shared/errors.js";
import type { Result } from "../shared/result.js";
import { SystemClock } from "../shared/time.js";
import type { Clock } from "../shared/time.js";
import type { Subscription, WsMessage } from "./types.js";

export interface WsManagerConfig {
	heartbeatTimeoutMs?: number;
	clock?: Clock;
}

/**
 * Minimal interface for the underlying WebSocket client.
 * Allows injection of stubs for testing.
 */
export interface WsClientLike {
	connect(): Promise<void>;
	send(data: string): Result<void, TradingError>;
	close(): void;
	getState(): WsState;
	onMessage(handler: (data: string) => void): void;
	onClose(handler: (code: number, reason: string) => void): void;
	onError(handler: (error: Error) => void): void;
}

/**
 * Manages WebSocket subscriptions, message buffering, and generation tracking.
 *
 * Messages received from an old generation (before reconnect) are discarded.
 * Subscriptions are automatically replayed after reconnect.
 */
export class WsManager {
	private readonly client: WsClientLike;
	private readonly subscriptions: Map<string, Subscription> = new Map();
	private buffer: WsMessage[] = [];
	private _generation = 0;
	private readonly heartbeatTimeoutMs: number;
	private readonly clock: Clock;
	private lastMessageAtMs: number | null = null;

	constructor(client: WsClientLike, config: WsManagerConfig = {}) {
		this.client = client;
		this.heartbeatTimeoutMs = config.heartbeatTimeoutMs ?? -1;
		this.clock = config.clock ?? SystemClock;
		this.client.onMessage((data) => this.handleMessage(data));
	}

	get generation(): number {
		return this._generation;
	}

	isHeartbeatStale(): boolean {
		if (this.heartbeatTimeoutMs < 0) {
			return false;
		}
		if (this.lastMessageAtMs === null) {
			return false;
		}
		return this.clock.now() - this.lastMessageAtMs > this.heartbeatTimeoutMs;
	}

	checkHeartbeat(): "healthy" | "stale" {
		return this.isHeartbeatStale() ? "stale" : "healthy";
	}

	async connect(): Promise<void> {
		await this.client.connect();
		this._generation += 1;
		this.lastMessageAtMs = this.clock.now();
	}

	subscribe(sub: Subscription): Result<void, TradingError> {
		this.subscriptions.set(sub.channel, sub);
		return this.client.send(
			JSON.stringify({ action: "subscribe", channel: sub.channel, assets: sub.assets }),
		);
	}

	unsubscribe(channel: string): Result<void, TradingError> {
		this.subscriptions.delete(channel);
		return this.client.send(JSON.stringify({ action: "unsubscribe", channel }));
	}

	drain(): WsMessage[] {
		const messages = this.buffer;
		this.buffer = [];
		return messages;
	}

	async reconnect(): Promise<void> {
		this.client.close();
		this.buffer = [];
		this.lastMessageAtMs = this.clock.now();
		await this.client.connect();
		this._generation += 1;
		this.replaySubscriptions();
	}

	private handleMessage(data: string): void {
		const parsed = parseMessage(data);
		if (parsed !== null) {
			this.buffer.push(parsed);
		}
		this.lastMessageAtMs = this.clock.now();
	}

	private replaySubscriptions(): void {
		for (const sub of this.subscriptions.values()) {
			this.client.send(
				JSON.stringify({
					action: "subscribe",
					channel: sub.channel,
					assets: sub.assets,
				}),
			);
		}
	}
}

function parseMessage(data: string): WsMessage | null {
	try {
		const parsed: unknown = JSON.parse(data);
		if (typeof parsed !== "object" || parsed === null) return null;
		const raw = parsed as RawMsg;
		if (typeof raw.type !== "string") return null;
		if (raw.type === "book_update" && isBookUpdate(raw)) return raw as unknown as WsMessage;
		if (raw.type === "user_fill" && isUserFill(raw)) return raw as unknown as WsMessage;
		if (raw.type === "user_order_status" && isUserOrderStatus(raw))
			return raw as unknown as WsMessage;
		if (raw.type === "heartbeat" && hasTimestamp(raw)) return raw as unknown as WsMessage;
		return null;
	} catch {
		return null;
	}
}

interface RawMsg {
	type: string;
	conditionId?: unknown;
	bids?: unknown;
	asks?: unknown;
	orderId?: unknown;
	filledSize?: unknown;
	fillPrice?: unknown;
	status?: unknown;
	timestampMs?: unknown;
}

function isBookUpdate(raw: RawMsg): boolean {
	return (
		typeof raw.conditionId === "string" &&
		Array.isArray(raw.bids) &&
		Array.isArray(raw.asks) &&
		typeof raw.timestampMs === "number"
	);
}

function isUserFill(raw: RawMsg): boolean {
	return (
		typeof raw.orderId === "string" &&
		typeof raw.filledSize === "string" &&
		typeof raw.fillPrice === "string" &&
		typeof raw.timestampMs === "number"
	);
}

function isUserOrderStatus(raw: RawMsg): boolean {
	return (
		typeof raw.orderId === "string" &&
		typeof raw.status === "string" &&
		typeof raw.timestampMs === "number"
	);
}

function hasTimestamp(raw: RawMsg): boolean {
	return typeof raw.timestampMs === "number";
}
