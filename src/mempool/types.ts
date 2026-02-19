/**
 * Mempool monitoring types -- pending transaction detection for CTF contracts.
 */

import type { EthAddress } from "../shared/identifiers.js";
import type { Clock } from "../shared/time.js";

/** Configuration for the mempool monitor. */
export interface MempoolConfig {
	/** WebSocket RPC URL for the Ethereum node (ws:// or wss://). */
	readonly rpcWsUrl: string;
	/** Address of the CTF exchange contract to monitor (optional, branded). */
	readonly ctfAddress?: EthAddress;
	/** Injectable clock for deterministic testing. */
	readonly clock?: Clock;
}

/**
 * Fallback event for any pending tx not classified as merge/redeem.
 * No size threshold enforced in stub.
 */
export interface WhaleDetectedEvent {
	readonly type: "whale_detected";
	readonly txHash: string;
	readonly from: string;
	readonly method: string;
	readonly timestamp: number;
}

/** Event emitted when a merge (combine positions) signal is detected. */
export interface MergeSignalEvent {
	readonly type: "merge_signal";
	readonly txHash: string;
	readonly from: string;
	readonly timestamp: number;
}

/** Event emitted when a redeem (settle positions) signal is detected. */
export interface RedeemSignalEvent {
	readonly type: "redeem_signal";
	readonly txHash: string;
	readonly from: string;
	readonly timestamp: number;
}

/** Union of all mempool events emitted by the monitor. */
export type MempoolEvent = WhaleDetectedEvent | MergeSignalEvent | RedeemSignalEvent;

/**
 * Aggregate statistics for the mempool monitor.
 *
 * @remarks ctfTxSeen is always <= txSeen
 */
export interface MempoolStats {
	/** Total transactions seen on the pending feed. */
	readonly txSeen: number;
	/** Transactions identified as targeting the CTF contract. */
	readonly ctfTxSeen: number;
	/** Total events emitted to registered handlers. */
	readonly eventsEmitted: number;
	/** Messages that failed JSON parsing. */
	readonly parseErrors: number;
}
