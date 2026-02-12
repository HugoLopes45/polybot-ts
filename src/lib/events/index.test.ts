import { describe, expect, it, vi } from "vitest";
import { TypedEmitter } from "./index.js";

interface TestEvents {
	tick: (ctx: { price: number }) => void;
	error: (err: Error) => void;
	ping: () => void;
}

describe("TypedEmitter", () => {
	it("emit() triggers registered on() handler with correct args", () => {
		const emitter = new TypedEmitter<TestEvents>();
		const handler = vi.fn();

		emitter.on("tick", handler);
		emitter.emit("tick", { price: 42.5 });

		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler).toHaveBeenCalledWith({ price: 42.5 });
	});

	it("off() removes a listener", () => {
		const emitter = new TypedEmitter<TestEvents>();
		const handler = vi.fn();

		emitter.on("tick", handler);
		emitter.off("tick", handler);
		emitter.emit("tick", { price: 1 });

		expect(handler).not.toHaveBeenCalled();
	});

	it("once() fires handler exactly once", () => {
		const emitter = new TypedEmitter<TestEvents>();
		const handler = vi.fn();

		emitter.once("tick", handler);
		emitter.emit("tick", { price: 10 });
		emitter.emit("tick", { price: 20 });

		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler).toHaveBeenCalledWith({ price: 10 });
	});

	it("multiple listeners on same event all fire", () => {
		const emitter = new TypedEmitter<TestEvents>();
		const h1 = vi.fn();
		const h2 = vi.fn();
		const h3 = vi.fn();

		emitter.on("tick", h1);
		emitter.on("tick", h2);
		emitter.on("tick", h3);
		emitter.emit("tick", { price: 99 });

		expect(h1).toHaveBeenCalledTimes(1);
		expect(h2).toHaveBeenCalledTimes(1);
		expect(h3).toHaveBeenCalledTimes(1);
	});

	it("emit returns false when no listeners", () => {
		const emitter = new TypedEmitter<TestEvents>();

		const result = emitter.emit("tick", { price: 0 });

		expect(result).toBe(false);
	});

	it("removeAllListeners() clears all handlers for an event", () => {
		const emitter = new TypedEmitter<TestEvents>();
		const h1 = vi.fn();
		const h2 = vi.fn();

		emitter.on("tick", h1);
		emitter.on("tick", h2);
		emitter.removeAllListeners("tick");
		emitter.emit("tick", { price: 5 });

		expect(h1).not.toHaveBeenCalled();
		expect(h2).not.toHaveBeenCalled();
	});

	it("listenerCount() returns correct count", () => {
		const emitter = new TypedEmitter<TestEvents>();
		const h1 = vi.fn();
		const h2 = vi.fn();
		const h3 = vi.fn();

		expect(emitter.listenerCount("tick")).toBe(0);

		emitter.on("tick", h1);
		expect(emitter.listenerCount("tick")).toBe(1);

		emitter.on("tick", h2);
		emitter.on("tick", h3);
		expect(emitter.listenerCount("tick")).toBe(3);

		emitter.off("tick", h2);
		expect(emitter.listenerCount("tick")).toBe(2);
	});

	it("removeAllListeners() with no argument clears all events", () => {
		const emitter = new TypedEmitter<TestEvents>();
		const tickHandler = vi.fn();
		const errorHandler = vi.fn();

		emitter.on("tick", tickHandler);
		emitter.on("error", errorHandler);
		emitter.removeAllListeners();
		emitter.emit("tick", { price: 1 });
		emitter.emit("error", new Error("boom"));

		expect(tickHandler).not.toHaveBeenCalled();
		expect(errorHandler).not.toHaveBeenCalled();
	});

	it("on/off/once return this for chaining", () => {
		const emitter = new TypedEmitter<TestEvents>();
		const handler = vi.fn();

		const result = emitter.on("tick", handler).once("ping", handler).off("tick", handler);

		expect(result).toBe(emitter);
	});
});
