/**
 * Base SDK configuration types.
 *
 * Strategy-specific config extends this base. The SDK enforces
 * that production builds provide all required safety parameters.
 */

import { ConfigError } from "./errors.js";

export interface SdkConfig {
	/** Human-readable strategy name */
	readonly name: string;
	/** Tick interval in milliseconds (how often the strategy evaluates) */
	readonly tickIntervalMs: number;
	/** Maximum concurrent open positions */
	readonly maxPositions: number;
	/** Maximum single order size in USDC */
	readonly maxOrderSizeUsdc: number;
	/** Maximum daily loss in USDC before kill switch triggers */
	readonly maxDailyLossUsdc: number;
	/** Whether to enable paper trading mode */
	readonly paperMode: boolean;
	/** Maximum slippage tolerance in basis points (optional) */
	readonly maxSlippageBps?: number | undefined;
}

export const DEFAULT_SDK_CONFIG: SdkConfig = {
	name: "unnamed-strategy",
	tickIntervalMs: 1_000,
	maxPositions: 5,
	maxOrderSizeUsdc: 100,
	maxDailyLossUsdc: 500,
	paperMode: true,
};

const DEFAULT_REFERENCE_BALANCE_USDC = 10_000;

/**
 * Converts an absolute USDC loss limit to a percentage relative to a reference balance.
 * Used to configure KillSwitchGuard thresholds. The default reference balance is $10,000.
 * @param usdc - Maximum daily loss in USDC
 * @param referenceBalance - The balance to calculate percentage against (default: 10,000)
 */
export function maxDailyLossUsdcToPct(
	usdc: number,
	referenceBalance = DEFAULT_REFERENCE_BALANCE_USDC,
): number {
	if (referenceBalance <= 0) {
		return 100;
	}
	return (usdc / referenceBalance) * 100;
}

/**
 * Reads SDK config values from environment variables.
 * Supported: POLYBOT_NAME, POLYBOT_TICK_INTERVAL_MS, POLYBOT_MAX_POSITIONS,
 * POLYBOT_MAX_ORDER_SIZE_USDC, POLYBOT_MAX_DAILY_LOSS_USDC, POLYBOT_PAPER_MODE.
 * @throws ConfigError if a numeric env var contains an invalid value
 */
/** Mutable builder shape for constructing Partial<SdkConfig> without TS4111 index issues. */
interface MutableSdkConfig {
	name?: string;
	tickIntervalMs?: number;
	maxPositions?: number;
	maxOrderSizeUsdc?: number;
	maxDailyLossUsdc?: number;
	paperMode?: boolean;
	maxSlippageBps?: number;
}

export function configFromEnv(): Partial<SdkConfig> {
	const result: MutableSdkConfig = {};

	// biome-ignore lint/complexity/useLiteralKeys: TS4111 requires bracket access on index signatures
	const envName = process.env["POLYBOT_NAME"];
	if (envName) {
		result.name = envName;
	}

	parsePositiveIntEnv("POLYBOT_TICK_INTERVAL_MS", "tickIntervalMs", result);
	parsePositiveIntEnv("POLYBOT_MAX_POSITIONS", "maxPositions", result);
	parsePositiveIntEnv("POLYBOT_MAX_ORDER_SIZE_USDC", "maxOrderSizeUsdc", result);
	parsePositiveIntEnv("POLYBOT_MAX_DAILY_LOSS_USDC", "maxDailyLossUsdc", result);
	parseNonNegativeIntEnv("POLYBOT_MAX_SLIPPAGE_BPS", "maxSlippageBps", result);

	// biome-ignore lint/complexity/useLiteralKeys: TS4111 requires bracket access on index signatures
	if (process.env["POLYBOT_PAPER_MODE"] !== undefined) {
		// biome-ignore lint/complexity/useLiteralKeys: TS4111 requires bracket access on index signatures
		result.paperMode = process.env["POLYBOT_PAPER_MODE"] === "true";
	}

	return result;
}

function strictParseInt(raw: string): number {
	const parsed = Number.parseInt(raw, 10);
	if (Number.isNaN(parsed) || String(parsed) !== raw.trim()) {
		return Number.NaN;
	}
	return parsed;
}

function parsePositiveIntEnv(
	envKey: string,
	configKey: keyof MutableSdkConfig,
	result: MutableSdkConfig,
): void {
	const raw = process.env[envKey];
	if (!raw) return;
	const parsed = strictParseInt(raw);
	if (Number.isNaN(parsed) || parsed <= 0) {
		throw new ConfigError(`Invalid ${envKey}: "${raw}" must be a positive integer`);
	}
	(result as Record<string, number>)[configKey] = parsed;
}

function parseNonNegativeIntEnv(
	envKey: string,
	configKey: keyof MutableSdkConfig,
	result: MutableSdkConfig,
): void {
	const raw = process.env[envKey];
	if (!raw) return;
	const parsed = strictParseInt(raw);
	if (Number.isNaN(parsed) || parsed < 0) {
		throw new ConfigError(`Invalid ${envKey}: "${raw}" must be a non-negative integer`);
	}
	(result as Record<string, number>)[configKey] = parsed;
}
