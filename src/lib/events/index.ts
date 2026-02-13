import EventEmitter from "eventemitter3";

/**
 * Generic typed event map -- keys are event names, values are handler signatures.
 * Example: { tick: (ctx: TickContext) => void; error: (err: Error) => void }
 */
// biome-ignore lint/suspicious/noExplicitAny: base constraint for event handler signatures
export type EventMap = Record<string, (...args: any[]) => void>;

/**
 * Type-safe event emitter wrapping eventemitter3 with compile-time handler validation.
 *
 * @example
 * ```ts
 * type Events = { tick: (n: number) => void; error: (e: Error) => void };
 * const emitter = new TypedEmitter<Events>();
 * emitter.on("tick", (n) => console.log(n));
 * emitter.emit("tick", 42);
 * ```
 */
export class TypedEmitter<TEvents extends EventMap> {
	private readonly ee = new EventEmitter();

	/**
	 * Registers an event handler.
	 * @param event - Event name
	 * @param handler - Handler function matching the event signature
	 */
	on<K extends keyof TEvents & string>(event: K, handler: TEvents[K]): this {
		this.ee.on(event, handler as (...args: unknown[]) => void);
		return this;
	}

	/**
	 * Removes a previously registered event handler.
	 * @param event - Event name
	 * @param handler - The handler to remove
	 */
	off<K extends keyof TEvents & string>(event: K, handler: TEvents[K]): this {
		this.ee.off(event, handler as (...args: unknown[]) => void);
		return this;
	}

	/**
	 * Registers a one-time event handler that auto-removes after first invocation.
	 * @param event - Event name
	 * @param handler - Handler function
	 */
	once<K extends keyof TEvents & string>(event: K, handler: TEvents[K]): this {
		this.ee.once(event, handler as (...args: unknown[]) => void);
		return this;
	}

	/**
	 * Emits an event, invoking all registered handlers.
	 * @param event - Event name
	 * @param args - Arguments matching the event handler signature
	 */
	emit<K extends keyof TEvents & string>(event: K, ...args: Parameters<TEvents[K]>): boolean {
		return this.ee.emit(event, ...args);
	}

	/**
	 * Removes all listeners for a specific event, or all events if none specified.
	 * @param event - Optional event name
	 */
	removeAllListeners<K extends keyof TEvents & string>(event?: K): this {
		if (event) {
			this.ee.removeAllListeners(event);
		} else {
			this.ee.removeAllListeners();
		}
		return this;
	}

	/**
	 * Returns the number of listeners registered for an event.
	 * @param event - Event name
	 */
	listenerCount<K extends keyof TEvents & string>(event: K): number {
		return this.ee.listenerCount(event);
	}
}
