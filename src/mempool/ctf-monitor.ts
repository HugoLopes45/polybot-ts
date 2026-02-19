/**
 * CTF mempool monitor -- watches Ethereum pending transactions for CTF contract activity.
 *
 * Subscribes to newPendingTransactions via JSON-RPC over WebSocket and emits
 * domain events for whale activity, merge, and redeem signals.
 */

import { createLogger } from "../lib/logger/index.js";
import { WsClient } from "../lib/websocket/client.js";
import { NetworkError } from "../shared/errors.js";
import type { TradingError } from "../shared/errors.js";
import type { Result } from "../shared/result.js";
import { err } from "../shared/result.js";
import { SystemClock } from "../shared/time.js";
import type { Clock } from "../shared/time.js";
import type { WsClientLike } from "../websocket/ws-manager.js";
import type { MempoolConfig, MempoolEvent, MempoolStats } from "./types.js";

const logger = createLogger({ level: "warn" });

// Stub detection strings — in production, match the 4-byte ABI selector
// against tx.input (e.g. 0x2eb2c2d6 for mergePositions).
const MERGE_SUFFIX = "merge";
const REDEEM_SUFFIX = "redeem";

/** JSON-RPC subscription notification shape. */
interface JsonRpcNotification {
	readonly jsonrpc: string;
	readonly method: string;
	readonly params?: {
		readonly subscription?: string;
		readonly result?: unknown;
	};
}

/**
 * Monitors Ethereum mempool for pending transactions targeting the CTF exchange contract.
 *
 * In production, this would use eth_getTransactionByHash to decode full calldata.
 * This SDK implementation provides a simplified stub that detects tx hashes
 * and classifies them by suffix-matching as a demonstration of the pattern.
 */
export class CtfMempoolMonitor {
	private readonly wsClient: WsClientLike;
	private readonly clock: Clock;
	private handlers: ((event: MempoolEvent) => void)[] = [];
	private txSeen = 0;
	private ctfTxSeen = 0;
	private eventsEmitted = 0;
	private parseErrors = 0;

	constructor(config: MempoolConfig, wsClient?: WsClientLike) {
		this.clock = config.clock ?? SystemClock;
		this.wsClient =
			wsClient ??
			new WsClient({
				url: config.rpcWsUrl,
				pingIntervalMs: 30_000,
				pongTimeoutMs: 10_000,
			});
	}

	/** Connects to the WebSocket endpoint and subscribes to pending transactions. */
	async connect(): Promise<Result<void, TradingError>> {
		try {
			await this.wsClient.connect();
		} catch (e: unknown) {
			const message = e instanceof Error ? e.message : String(e);
			return err(new NetworkError(`Mempool connect failed: ${message}`, { cause: e }));
		}

		this.wsClient.onMessage((data) => this.handleMessage(data));

		const subscribeMsg = JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "eth_subscribe",
			params: ["newPendingTransactions"],
		});

		return this.wsClient.send(subscribeMsg);
	}

	/** Closes the WebSocket connection. */
	disconnect(): void {
		this.wsClient.close();
	}

	/**
	 * Registers an event handler. Returns an unsubscribe function.
	 * @param handler - Callback invoked for each mempool event
	 */
	onEvent(handler: (event: MempoolEvent) => void): () => void {
		this.handlers.push(handler);
		return () => {
			this.handlers = this.handlers.filter((h) => h !== handler);
		};
	}

	/** Returns aggregate monitoring statistics. */
	get stats(): MempoolStats {
		return {
			txSeen: this.txSeen,
			ctfTxSeen: this.ctfTxSeen,
			eventsEmitted: this.eventsEmitted,
			parseErrors: this.parseErrors,
		};
	}

	private handleMessage(data: string): void {
		let parsed: unknown;
		try {
			parsed = JSON.parse(data);
		} catch (_e: unknown) {
			this.parseErrors += 1;
			logger.warn({ dataLength: data.length }, "Mempool message failed JSON parsing");
			return;
		}

		const notification = asNotification(parsed);
		if (notification === null) return;

		const txHash = notification.params?.result;
		if (typeof txHash !== "string" || !txHash.startsWith("0x")) return;

		this.txSeen += 1;
		const timestamp = this.clock.now();

		const event = classifyTx(txHash, timestamp);
		if (event.type === "merge_signal" || event.type === "redeem_signal") {
			this.ctfTxSeen += 1;
		}

		this.emitEvent(event);
	}

	private emitEvent(event: MempoolEvent): void {
		this.eventsEmitted += 1;
		for (const handler of this.handlers) {
			try {
				handler(event);
			} catch (e: unknown) {
				logger.warn(
					{ err: e instanceof Error ? e.message : String(e) },
					"Mempool event handler threw",
				);
			}
		}
	}
}

function asNotification(parsed: unknown): JsonRpcNotification | null {
	if (typeof parsed !== "object" || parsed === null) return null;
	const obj = parsed as JsonRpcNotification;
	if (obj.method !== "eth_subscription") return null;
	if (obj.params === undefined) return null;
	return obj;
}

/**
 * Classify a pending transaction hash into a mempool event type.
 *
 * In production, this would decode the full transaction calldata.
 * The SDK stub uses suffix-matching as a simplified demonstration.
 */
function classifyTx(txHash: string, timestamp: number): MempoolEvent {
	const lower = txHash.toLowerCase();
	if (lower.endsWith(MERGE_SUFFIX)) {
		return {
			type: "merge_signal",
			txHash,
			from: "pending",
			timestamp,
		};
	}
	if (lower.endsWith(REDEEM_SUFFIX)) {
		return {
			type: "redeem_signal",
			txHash,
			from: "pending",
			timestamp,
		};
	}
	return {
		type: "whale_detected",
		txHash,
		from: "pending",
		method: "pending_tx",
		timestamp,
	};
}
