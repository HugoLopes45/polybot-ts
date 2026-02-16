import { describe, expect, it } from "vitest";
import { LatencyHistogram } from "./latency-histogram.js";

describe("LatencyHistogram", () => {
	it("starts with zero count", () => {
		const h = LatencyHistogram.create();
		expect(h.count).toBe(0);
	});

	it("returns 0 for percentiles with no data", () => {
		const h = LatencyHistogram.create();
		expect(h.p50()).toBe(0);
		expect(h.p95()).toBe(0);
		expect(h.p99()).toBe(0);
	});

	it("records samples and tracks count", () => {
		const h = LatencyHistogram.create();
		h.recordUs(100);
		h.recordUs(200);
		h.recordMs(0.5);
		expect(h.count).toBe(3);
	});

	it("computes p50 for uniform low-latency data", () => {
		const h = LatencyHistogram.create();
		// 100 samples at 500μs (0.5ms)
		for (let i = 0; i < 100; i++) {
			h.recordUs(500);
		}
		const p50 = h.p50();
		// Should be in the 512μs bucket → 0.512ms
		expect(p50).toBeGreaterThan(0);
		expect(p50).toBeLessThan(2);
	});

	it("p99 >= p95 >= p50", () => {
		const h = LatencyHistogram.create();
		// Mix of latencies
		for (let i = 0; i < 80; i++) h.recordUs(100);
		for (let i = 0; i < 15; i++) h.recordUs(5000);
		for (let i = 0; i < 5; i++) h.recordUs(20000);

		expect(h.p99()).toBeGreaterThanOrEqual(h.p95());
		expect(h.p95()).toBeGreaterThanOrEqual(h.p50());
	});

	it("handles very high latency in overflow bucket", () => {
		const h = LatencyHistogram.create();
		h.recordUs(100000); // 100ms
		expect(h.p50()).toBeGreaterThan(30); // 32768μs = ~32.8ms
	});

	it("handles zero/negative latency", () => {
		const h = LatencyHistogram.create();
		h.recordUs(0);
		h.recordUs(-1);
		expect(h.count).toBe(2);
		expect(h.p50()).toBeGreaterThanOrEqual(0);
	});

	it("resets all state", () => {
		const h = LatencyHistogram.create();
		for (let i = 0; i < 50; i++) h.recordUs(1000);
		h.reset();
		expect(h.count).toBe(0);
		expect(h.p50()).toBe(0);
	});

	it("recordMs converts correctly", () => {
		const h = LatencyHistogram.create();
		h.recordMs(1); // 1ms = 1000μs
		expect(h.count).toBe(1);
		// 1000μs falls in 1024 bucket
		expect(h.p50()).toBeGreaterThan(0);
	});

	it("handles bimodal distribution", () => {
		const h = LatencyHistogram.create();
		// 90% fast, 10% slow
		for (let i = 0; i < 90; i++) h.recordUs(50);
		for (let i = 0; i < 10; i++) h.recordUs(10000);

		// p50 should be low (fast bucket)
		expect(h.p50()).toBeLessThan(1);
		// p95 should be high (slow bucket)
		expect(h.p95()).toBeGreaterThan(5);
	});
});
