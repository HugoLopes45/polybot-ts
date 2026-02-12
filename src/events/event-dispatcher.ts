/**
 * EventDispatcher — typed pub/sub for SDK and domain events.
 *
 * Synchronous dispatch (no async handlers) to keep the tick loop fast.
 * Handlers are called in registration order.
 */

import type { DomainEvent, DomainEventType } from "./domain-events.js";
import type { SdkEvent, SdkEventType } from "./sdk-events.js";

type SdkEventHandler = (event: SdkEvent) => void;
type DomainEventHandler = (event: DomainEvent) => void;

export class EventDispatcher {
	private readonly sdkHandlers: Map<SdkEventType | "*", SdkEventHandler[]>;
	private readonly domainHandlers: Map<DomainEventType | "*", DomainEventHandler[]>;

	constructor() {
		this.sdkHandlers = new Map();
		this.domainHandlers = new Map();
	}

	// ── SDK Events ─────────────────────────────────────────────────

	/** Subscribe to a specific SDK event type, or "*" for all */
	onSdk(type: SdkEventType | "*", handler: SdkEventHandler): () => void {
		const handlers = this.sdkHandlers.get(type) ?? [];
		handlers.push(handler);
		this.sdkHandlers.set(type, handlers);

		return () => {
			const list = this.sdkHandlers.get(type);
			if (list) {
				const idx = list.indexOf(handler);
				if (idx !== -1) list.splice(idx, 1);
			}
		};
	}

	/** Emit an SDK event to all matching handlers */
	emitSdk(event: SdkEvent): void {
		const typeHandlers = this.sdkHandlers.get(event.type);
		if (typeHandlers) {
			for (const handler of typeHandlers) handler(event);
		}
		const wildcard = this.sdkHandlers.get("*");
		if (wildcard) {
			for (const handler of wildcard) handler(event);
		}
	}

	// ── Domain Events ──────────────────────────────────────────────

	/** Subscribe to a specific domain event type, or "*" for all */
	onDomain(type: DomainEventType | "*", handler: DomainEventHandler): () => void {
		const handlers = this.domainHandlers.get(type) ?? [];
		handlers.push(handler);
		this.domainHandlers.set(type, handlers);

		return () => {
			const list = this.domainHandlers.get(type);
			if (list) {
				const idx = list.indexOf(handler);
				if (idx !== -1) list.splice(idx, 1);
			}
		};
	}

	/** Emit a domain event to all matching handlers */
	emitDomain(event: DomainEvent): void {
		const typeHandlers = this.domainHandlers.get(event.type);
		if (typeHandlers) {
			for (const handler of typeHandlers) handler(event);
		}
		const wildcard = this.domainHandlers.get("*");
		if (wildcard) {
			for (const handler of wildcard) handler(event);
		}
	}

	/** Remove all handlers */
	clear(): void {
		this.sdkHandlers.clear();
		this.domainHandlers.clear();
	}
}
