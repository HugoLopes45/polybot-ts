import { describe, expect, it } from "vitest";
import { DEFAULT_SDK_CONFIG, configFromEnv, maxDailyLossUsdcToPct } from "./config.js";
import { ConfigError } from "./errors.js";

function clearEnv(key: string): void {
	Reflect.deleteProperty(process.env, key);
}

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

	describe("configFromEnv", () => {
		it("returns empty object when no POLYBOT_ env vars", () => {
			const env = process.env;
			const polybotKeys = Object.keys(env).filter((k) => k.startsWith("POLYBOT_"));
			for (const k of polybotKeys) {
				Reflect.deleteProperty(env, k);
			}

			const result = configFromEnv();
			expect(result).toEqual({});
		});

		it("reads POLYBOT_NAME", () => {
			process.env.POLYBOT_NAME = "my-strategy";
			const result = configFromEnv();
			expect(result.name).toBe("my-strategy");
			clearEnv("POLYBOT_NAME");
		});

		it("reads POLYBOT_TICK_INTERVAL_MS", () => {
			process.env.POLYBOT_TICK_INTERVAL_MS = "5000";
			const result = configFromEnv();
			expect(result.tickIntervalMs).toBe(5_000);
			clearEnv("POLYBOT_TICK_INTERVAL_MS");
		});

		it("reads POLYBOT_MAX_POSITIONS", () => {
			process.env.POLYBOT_MAX_POSITIONS = "10";
			const result = configFromEnv();
			expect(result.maxPositions).toBe(10);
			clearEnv("POLYBOT_MAX_POSITIONS");
		});

		it("reads POLYBOT_MAX_ORDER_SIZE_USDC", () => {
			process.env.POLYBOT_MAX_ORDER_SIZE_USDC = "500";
			const result = configFromEnv();
			expect(result.maxOrderSizeUsdc).toBe(500);
			clearEnv("POLYBOT_MAX_ORDER_SIZE_USDC");
		});

		it("reads POLYBOT_MAX_DAILY_LOSS_USDC", () => {
			process.env.POLYBOT_MAX_DAILY_LOSS_USDC = "1000";
			const result = configFromEnv();
			expect(result.maxDailyLossUsdc).toBe(1_000);
			clearEnv("POLYBOT_MAX_DAILY_LOSS_USDC");
		});

		it("reads POLYBOT_PAPER_MODE as boolean", () => {
			process.env.POLYBOT_PAPER_MODE = "false";
			const result = configFromEnv();
			expect(result.paperMode).toBe(false);
			clearEnv("POLYBOT_PAPER_MODE");
		});

		it("reads multiple env vars at once", () => {
			process.env.POLYBOT_NAME = "env-strategy";
			process.env.POLYBOT_TICK_INTERVAL_MS = "2000";
			process.env.POLYBOT_MAX_POSITIONS = "3";
			process.env.POLYBOT_PAPER_MODE = "false";

			const result = configFromEnv();
			expect(result.name).toBe("env-strategy");
			expect(result.tickIntervalMs).toBe(2_000);
			expect(result.maxPositions).toBe(3);
			expect(result.paperMode).toBe(false);

			clearEnv("POLYBOT_NAME");
			clearEnv("POLYBOT_TICK_INTERVAL_MS");
			clearEnv("POLYBOT_MAX_POSITIONS");
			clearEnv("POLYBOT_PAPER_MODE");
		});

		it("returns Partial<SdkConfig>", () => {
			process.env.POLYBOT_NAME = "partial-test";
			const result = configFromEnv();
			expect(result).toHaveProperty("name");
			expect(result).not.toHaveProperty("unknownField");
			clearEnv("POLYBOT_NAME");
		});

		it("rejects trailing garbage in numeric env vars (S3)", () => {
			process.env.POLYBOT_MAX_POSITIONS = "123abc";
			expect(() => configFromEnv()).toThrow(ConfigError);
			clearEnv("POLYBOT_MAX_POSITIONS");
		});

		it("rejects fractional values in numeric env vars", () => {
			process.env.POLYBOT_TICK_INTERVAL_MS = "1000.5";
			expect(() => configFromEnv()).toThrow(ConfigError);
			clearEnv("POLYBOT_TICK_INTERVAL_MS");
		});

		it("allows zero for POLYBOT_MAX_SLIPPAGE_BPS (M5)", () => {
			process.env.POLYBOT_MAX_SLIPPAGE_BPS = "0";
			const result = configFromEnv();
			expect(result.maxSlippageBps).toBe(0);
			clearEnv("POLYBOT_MAX_SLIPPAGE_BPS");
		});

		it("rejects zero for POLYBOT_MAX_POSITIONS (must be positive)", () => {
			process.env.POLYBOT_MAX_POSITIONS = "0";
			expect(() => configFromEnv()).toThrow(ConfigError);
			clearEnv("POLYBOT_MAX_POSITIONS");
		});

		it("rejects negative values for POLYBOT_MAX_SLIPPAGE_BPS", () => {
			process.env.POLYBOT_MAX_SLIPPAGE_BPS = "-1";
			expect(() => configFromEnv()).toThrow(ConfigError);
			clearEnv("POLYBOT_MAX_SLIPPAGE_BPS");
		});
	});

	describe("maxDailyLossUsdcToPct", () => {
		it("returns 100 when referenceBalance is zero (S2)", () => {
			expect(maxDailyLossUsdcToPct(500, 0)).toBe(100);
		});

		it("returns 100 when referenceBalance is negative", () => {
			expect(maxDailyLossUsdcToPct(500, -1000)).toBe(100);
		});

		it("computes percentage with default referenceBalance", () => {
			expect(maxDailyLossUsdcToPct(500)).toBe(5);
		});

		it("computes percentage with custom referenceBalance", () => {
			expect(maxDailyLossUsdcToPct(250, 5000)).toBe(5);
		});
	});
});
