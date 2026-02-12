export interface WsConfig {
	readonly url: string;
	readonly pingIntervalMs: number;
	readonly pongTimeoutMs: number;
}

export type WsState = "connecting" | "open" | "closing" | "closed";

export type WsMessageHandler = (data: string) => void;
export type WsCloseHandler = (code: number, reason: string) => void;
export type WsErrorHandler = (error: Error) => void;
