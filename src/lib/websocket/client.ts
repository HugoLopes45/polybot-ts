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

	/**
	 * Opens the WebSocket connection. Rejects if already connecting or open.
	 * Starts ping/pong keepalive on successful connection.
	 */
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

	/**
	 * Sends data through the WebSocket connection.
	 * @param data - String payload to send
	 * @returns Result indicating success or a NetworkError
	 */
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

	/** Gracefully closes the WebSocket connection and clears keepalive timers. */
	close(): void {
		if (this.ws !== null) {
			this.state = "closing";
			this.clearTimers();
			this.ws.close();
		}
	}

	/** Returns the current connection state. */
	getState(): WsState {
		return this.state;
	}

	/**
	 * Registers a handler for incoming messages.
	 * @param handler - Callback receiving the message string
	 */
	onMessage(handler: WsMessageHandler): void {
		this.messageHandlers.push(handler);
	}

	/**
	 * Registers a handler for connection close events.
	 * @param handler - Callback receiving close code and reason
	 */
	onClose(handler: WsCloseHandler): void {
		this.closeHandlers.push(handler);
	}

	/**
	 * Registers a handler for connection errors.
	 * @param handler - Callback receiving the error
	 */
	onError(handler: WsErrorHandler): void {
		this.errorHandlers.push(handler);
	}

	/** Programmatically emits an error to all registered error handlers. */
	emitError(error: Error): void {
		for (const handler of this.errorHandlers) {
			handler(error);
		}
	}

	/**
	 * Removes a specific message handler.
	 * @param handler - The handler to remove
	 */
	offMessage(handler: WsMessageHandler): void {
		const index = this.messageHandlers.indexOf(handler);
		if (index !== -1) {
			this.messageHandlers.splice(index, 1);
		}
	}

	/**
	 * Removes a specific close handler.
	 * @param handler - The handler to remove
	 */
	offClose(handler: WsCloseHandler): void {
		const index = this.closeHandlers.indexOf(handler);
		if (index !== -1) {
			this.closeHandlers.splice(index, 1);
		}
	}

	/**
	 * Removes a specific error handler.
	 * @param handler - The handler to remove
	 */
	offError(handler: WsErrorHandler): void {
		const index = this.errorHandlers.indexOf(handler);
		if (index !== -1) {
			this.errorHandlers.splice(index, 1);
		}
	}

	/**
	 * Removes all registered handlers.
	 */
	clearHandlers(): void {
		this.messageHandlers.length = 0;
		this.closeHandlers.length = 0;
		this.errorHandlers.length = 0;
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
