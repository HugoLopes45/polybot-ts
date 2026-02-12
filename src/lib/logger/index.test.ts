import { describe, expect, it } from "vitest";
import { createLogger } from "./index.js";

describe("Logger", () => {
	describe("createLogger", () => {
		it("returns a Logger with all standard methods", () => {
			const logger = createLogger({ level: "info" });

			expect(typeof logger.info).toBe("function");
			expect(typeof logger.warn).toBe("function");
			expect(typeof logger.error).toBe("function");
			expect(typeof logger.debug).toBe("function");
			expect(typeof logger.child).toBe("function");
		});

		it("creates a child logger with bound context", () => {
			const logger = createLogger({ level: "info" });
			const child = logger.child({ module: "test" });

			expect(typeof child.info).toBe("function");
			expect(typeof child.warn).toBe("function");
			expect(typeof child.error).toBe("function");
			expect(typeof child.debug).toBe("function");
			expect(typeof child.child).toBe("function");
		});

		it("child logger produces grandchild", () => {
			const logger = createLogger({ level: "info" });
			const child = logger.child({ module: "parent" });
			const grandchild = child.child({ submodule: "child" });

			expect(typeof grandchild.info).toBe("function");
		});
	});

	describe("credential redaction", () => {
		it("redacts objects with __opaque property in serialized output", () => {
			const captured: string[] = [];
			const logger = createLogger({
				level: "info",
				destination: {
					write(msg: string) {
						captured.push(msg);
					},
				},
			});

			const fakeCredential = {
				__opaque: true as const,
				toString: () => "[REDACTED]",
				toJSON: () => "[REDACTED]",
			};

			logger.info({ credentials: fakeCredential }, "test message");

			expect(captured.length).toBeGreaterThan(0);
			const output = captured.join("");
			expect(output).not.toContain("__opaque");
			expect(output).toContain("[REDACTED]");
		});
	});

	describe("redact paths", () => {
		it("censors configured paths in log output", () => {
			const captured: string[] = [];
			const logger = createLogger({
				level: "info",
				redactPaths: ["secret"],
				destination: {
					write(msg: string) {
						captured.push(msg);
					},
				},
			});

			logger.info({ secret: "my-api-key", safe: "visible" }, "test");

			const output = captured.join("");
			expect(output).not.toContain("my-api-key");
			expect(output).toContain("visible");
		});
	});

	describe("log levels", () => {
		it("respects configured log level", () => {
			const captured: string[] = [];
			const logger = createLogger({
				level: "warn",
				destination: {
					write(msg: string) {
						captured.push(msg);
					},
				},
			});

			logger.debug("should not appear");
			logger.info("should not appear either");
			logger.warn("should appear");

			expect(captured.length).toBe(1);
			expect(captured[0]).toContain("should appear");
		});
	});

	describe("adversarial", () => {
		it("accepts valid log levels", () => {
			const validLevels = ["trace", "debug", "info", "warn", "error", "fatal"] as const;
			for (const level of validLevels) {
				expect(() => createLogger({ level })).not.toThrow();
			}
		});

		it("does not throw when logging undefined or null values", () => {
			const logger = createLogger({ level: "info" });
			expect(() => logger.info(undefined as unknown as string)).not.toThrow();
			expect(() => logger.info(null as unknown as string)).not.toThrow();
		});

		it("handles circular references gracefully", () => {
			const captured: string[] = [];
			const logger = createLogger({
				level: "info",
				destination: {
					write(msg: string) {
						captured.push(msg);
					},
				},
			});

			const circular: Record<string, unknown> = { name: "test" };
			circular.self = circular;

			expect(() => logger.info(circular, "circular test")).not.toThrow();
		});
	});
});
