import EventEmitter from "eventemitter3";

/**
 * Generic typed event map -- keys are event names, values are handler signatures.
 * Example: { tick: (ctx: TickContext) => void; error: (err: Error) => void }
 */
// biome-ignore lint/suspicious/noExplicitAny: base constraint for event handler signatures
export type EventMap = Record<string, (...args: any[]) => void>;

/** Type-safe event emitter wrapping eventemitter3 with compile-time handler validation. */
export class TypedEmitter<TEvents extends EventMap> {
	private readonly ee = new EventEmitter();

	on<K extends keyof TEvents & string>(event: K, handler: TEvents[K]): this {
		this.ee.on(event, handler as (...args: unknown[]) => void);
		return this;
	}

	off<K extends keyof TEvents & string>(event: K, handler: TEvents[K]): this {
		this.ee.off(event, handler as (...args: unknown[]) => void);
		return this;
	}

	once<K extends keyof TEvents & string>(event: K, handler: TEvents[K]): this {
		this.ee.once(event, handler as (...args: unknown[]) => void);
		return this;
	}

	emit<K extends keyof TEvents & string>(event: K, ...args: Parameters<TEvents[K]>): boolean {
		return this.ee.emit(event, ...args);
	}

	removeAllListeners<K extends keyof TEvents & string>(event?: K): this {
		if (event) {
			this.ee.removeAllListeners(event);
		} else {
			this.ee.removeAllListeners();
		}
		return this;
	}

	listenerCount<K extends keyof TEvents & string>(event: K): number {
		return this.ee.listenerCount(event);
	}
}
