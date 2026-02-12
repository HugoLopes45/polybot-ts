import WebSocket from "ws";
import { NetworkError } from "../../shared/errors.js";
import type { TradingError } from "../../shared/errors.js";
import { type Result, err, ok } from "../../shared/result.js";
import type {
	WsCloseHandler,
	WsConfig,
	WsErrorHandler,
	WsMessageHandler,
	WsState,
} from "./types.js";

/**
 * WebSocket client wrapper with ping/pong keepalive.
 *
 * Encapsulates the ws library behind a domain-friendly interface.
 * All network errors are returned as Result, never thrown.
 */
export class WsClient {
	private readonly config: WsConfig;
	private ws: WebSocket | null = null;
	private state: WsState = "closed";
	private readonly messageHandlers: WsMessageHandler[] = [];
	private readonly closeHandlers: WsCloseHandler[] = [];
	private readonly errorHandlers: WsErrorHandler[] = [];
	private pingTimer: ReturnType<typeof setInterval> | null = null;
	private pongTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(config: WsConfig) {
		this.config = config;
	}

	connect(): Promise<void> {
		if (this.state !== "closed") {
			return Promise.reject(new NetworkError("WebSocket is already connecting or open"));
		}
		return new Promise<void>((resolve, reject) => {
			this.state = "connecting";
			this.ws = new WebSocket(this.config.url);

			this.ws.on("open", () => {
				this.state = "open";
				this.startPing();
				resolve();
			});

			this.ws.on("message", (data) => {
				const message = data.toString();
				for (const handler of this.messageHandlers) {
					handler(message);
				}
			});

			this.ws.on("close", (code, reason) => {
				this.state = "closed";
				this.clearTimers();
				for (const handler of this.closeHandlers) {
					handler(code, reason.toString());
				}
			});

			this.ws.on("error", (error) => {
				for (const handler of this.errorHandlers) {
					handler(error);
				}
				if (this.state === "connecting") {
					this.state = "closed";
					this.clearTimers();
					reject(new NetworkError("WebSocket connection failed", { cause: error.message }));
				}
			});

			this.ws.on("pong", () => {
				this.clearPongTimeout();
			});
		});
	}

	send(data: string): Result<void, TradingError> {
		if (this.state !== "open" || this.ws === null) {
			return err(new NetworkError("WebSocket is not connected"));
		}
		try {
			this.ws.send(data);
			return ok(undefined);
		} catch (error) {
			return err(
				new NetworkError("WebSocket send failed", {
					cause: error instanceof Error ? error.message : String(error),
				}),
			);
		}
	}

	close(): void {
		if (this.ws !== null) {
			this.state = "closing";
			this.clearTimers();
			this.ws.close();
		}
	}

	getState(): WsState {
		return this.state;
	}

	onMessage(handler: WsMessageHandler): void {
		this.messageHandlers.push(handler);
	}

	onClose(handler: WsCloseHandler): void {
		this.closeHandlers.push(handler);
	}

	onError(handler: WsErrorHandler): void {
		this.errorHandlers.push(handler);
	}

	private startPing(): void {
		this.pingTimer = setInterval(() => {
			if (this.ws !== null && this.state === "open") {
				this.ws.ping();
				this.pongTimer = setTimeout(() => {
					if (this.ws !== null) {
						this.ws.terminate();
					}
				}, this.config.pongTimeoutMs);
			}
		}, this.config.pingIntervalMs);
	}

	private clearTimers(): void {
		if (this.pingTimer !== null) {
			clearInterval(this.pingTimer);
			this.pingTimer = null;
		}
		this.clearPongTimeout();
	}

	private clearPongTimeout(): void {
		if (this.pongTimer !== null) {
			clearTimeout(this.pongTimer);
			this.pongTimer = null;
		}
	}
}
