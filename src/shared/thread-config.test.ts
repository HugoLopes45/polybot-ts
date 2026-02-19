import { describe, expect, it, vi } from "vitest";
import { applyThreadConfig, getDefaultThreadConfig } from "./thread-config.js";

describe("ThreadConfig", () => {
	it("getDefaultThreadConfig returns workerCount 1", () => {
		const config = getDefaultThreadConfig();
		expect(config.workerCount).toBe(1);
	});

	it("getDefaultThreadConfig does not include stackSizeKb", () => {
		const config = getDefaultThreadConfig();
		expect(config).not.toHaveProperty("stackSizeKb");
	});

	it("applyThreadConfig with affinityHint writes to stderr", () => {
		const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		applyThreadConfig({ ...getDefaultThreadConfig(), affinityHint: "0-3" });
		expect(spy).toHaveBeenCalled();
		const output = spy.mock.calls.map((c) => String(c[0])).join("");
		expect(output).toContain("0-3");
		spy.mockRestore();
	});

	it("applyThreadConfig sanitizes newlines in affinityHint", () => {
		const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		applyThreadConfig({ affinityHint: "0\r\ninjected" });
		const output = spy.mock.calls.map((c) => String(c[0])).join("");
		expect(output).not.toContain("\r");
		expect(output).not.toContain("\n[");
		expect(output).toContain("0injected");
		spy.mockRestore();
	});

	it("applyThreadConfig with workerCount > 1 writes to stderr", () => {
		const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		applyThreadConfig({ ...getDefaultThreadConfig(), workerCount: 4 });
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});

	it("applyThreadConfig with default config writes nothing", () => {
		const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		applyThreadConfig(getDefaultThreadConfig());
		expect(spy).not.toHaveBeenCalled();
		spy.mockRestore();
	});
});
