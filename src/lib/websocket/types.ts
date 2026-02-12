/**
 * Configuration for WebSocket client.
 */
export interface WsConfig {
	/** WebSocket server URL (ws:// or wss://) */
	readonly url: string;
	/** Interval between ping frames in milliseconds. */
	readonly pingIntervalMs: number;
	/** Timeout waiting for pong response before terminating connection. */
	readonly pongTimeoutMs: number;
}

/**
 * WebSocket connection lifecycle state.
 * - `connecting`: Connection in progress
 * - `open`: Connected and ready
 * - `closing`: Close initiated
 * - `closed`: Connection terminated
 */
export type WsState = "connecting" | "open" | "closing" | "closed";

/**
 * Callback invoked when a message is received.
 * @param data - Raw message string
 */
export type WsMessageHandler = (data: string) => void;

/**
 * Callback invoked when connection closes.
 * @param code - WebSocket close code
 * @param reason - Close reason string
 */
export type WsCloseHandler = (code: number, reason: string) => void;

/**
 * Callback invoked on WebSocket error.
 * @param error - Error that occurred
 */
export type WsErrorHandler = (error: Error) => void;
