import { describe, expect, it } from "vitest";
import { DEFAULT_SDK_CONFIG } from "./config.js";

describe("SdkConfig", () => {
	describe("DEFAULT_SDK_CONFIG", () => {
		it("has sensible defaults", () => {
			expect(DEFAULT_SDK_CONFIG.name).toBe("unnamed-strategy");
			expect(DEFAULT_SDK_CONFIG.tickIntervalMs).toBe(1_000);
			expect(DEFAULT_SDK_CONFIG.maxPositions).toBe(5);
			expect(DEFAULT_SDK_CONFIG.maxOrderSizeUsdc).toBe(100);
			expect(DEFAULT_SDK_CONFIG.maxDailyLossUsdc).toBe(500);
			expect(DEFAULT_SDK_CONFIG.paperMode).toBe(true);
		});

		it("defaults to paper mode (safe by default)", () => {
			expect(DEFAULT_SDK_CONFIG.paperMode).toBe(true);
		});

		it("all fields are defined (no undefined values)", () => {
			for (const [key, value] of Object.entries(DEFAULT_SDK_CONFIG)) {
				expect(value, `${key} should not be undefined`).toBeDefined();
			}
		});
	});
});
