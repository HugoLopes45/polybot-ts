import { describe, expect, it, vi } from "vitest";
import { clientOrderId } from "../shared/identifiers.js";
import { OrderHandleBuilder } from "./order-handle-builder.js";

describe("OrderHandleBuilder", () => {
	it("builds a handle with all callbacks", () => {
		const fillFn = vi.fn();
		const completeFn = vi.fn();
		const cancelFn = vi.fn();

		const handle = OrderHandleBuilder.create(clientOrderId("ord-1"))
			.onFill(fillFn)
			.onComplete(completeFn)
			.onCancel(cancelFn)
			.timeout(5000)
			.build();

		expect(handle.clientOrderId).toBe(clientOrderId("ord-1"));
		expect(handle.onFill).toBe(fillFn);
		expect(handle.onComplete).toBe(completeFn);
		expect(handle.onCancel).toBe(cancelFn);
		expect(handle.timeoutMs).toBe(5000);
	});

	it("builds a handle with no callbacks", () => {
		const handle = OrderHandleBuilder.create(clientOrderId("ord-2")).build();
		expect(handle.onFill).toBeNull();
		expect(handle.onComplete).toBeNull();
		expect(handle.onCancel).toBeNull();
		expect(handle.timeoutMs).toBeNull();
	});

	it("is immutable — builder does not modify previous state", () => {
		const b1 = OrderHandleBuilder.create(clientOrderId("ord-3"));
		const b2 = b1.timeout(3000);
		expect(b1.build().timeoutMs).toBeNull();
		expect(b2.build().timeoutMs).toBe(3000);
	});
});
