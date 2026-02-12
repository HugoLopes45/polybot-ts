import type { EventDispatcher } from "../../events/event-dispatcher.js";
import type { SdkEvent } from "../../events/sdk-events.js";
import type { SdkPosition } from "../../position/sdk-position.js";
import type { DetectorContextLike } from "../../signal/types.js";
import type { TickContext } from "../built-strategy.js";

export interface TestRunnerDeps {
	readonly eventDispatcher?: EventDispatcher | undefined;
	readonly getPositions?: (() => readonly SdkPosition[]) | undefined;
}

export class TestRunner {
	private _context: TickContext | DetectorContextLike | null = null;
	private readonly _events: SdkEvent[] = [];
	private readonly getPositions: (() => readonly SdkPosition[]) | null;

	constructor(deps: TestRunnerDeps = {}) {
		this.getPositions = deps.getPositions ?? null;
		if (deps.eventDispatcher) {
			deps.eventDispatcher.onSdk("*", (event) => {
				this._events.push(event);
			});
		}
	}

	get context(): TickContext | DetectorContextLike | null {
		return this._context;
	}

	withContext(ctx: TickContext | DetectorContextLike): this {
		this._context = ctx;
		return this;
	}

	async tick(fn: (ctx: TickContext | DetectorContextLike) => Promise<void>): Promise<this> {
		if (!this._context) {
			throw new Error("Context not set. Call withContext() first.");
		}
		await fn(this._context);
		return this;
	}

	async tickN(
		fn: (ctx: TickContext | DetectorContextLike) => Promise<void>,
		n: number,
	): Promise<this> {
		for (let i = 0; i < n; i++) {
			await this.tick(fn);
		}
		return this;
	}

	events(): readonly SdkEvent[] {
		return [...this._events];
	}

	eventsOfType<T extends SdkEvent["type"]>(type: T): readonly SdkEvent[] {
		return this._events.filter((e) => e.type === type);
	}

	positions(): readonly SdkPosition[] {
		return this.getPositions ? [...this.getPositions()] : [];
	}

	assertNoTrades(): void {
		const orderEvents = this._events.filter((e) => e.type === "order_placed");
		if (orderEvents.length > 0) {
			throw new Error(`Expected no trades but found ${orderEvents.length}`);
		}
	}

	assertTradeCount(expected: number): void {
		const orderEvents = this._events.filter((e) => e.type === "order_placed");
		if (orderEvents.length !== expected) {
			throw new Error(`Expected ${expected} trades but found ${orderEvents.length}`);
		}
	}
}
