/**
 * Base SDK configuration types.
 *
 * Strategy-specific config extends this base. The SDK enforces
 * that production builds provide all required safety parameters.
 */

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
}

export const DEFAULT_SDK_CONFIG: SdkConfig = {
	name: "unnamed-strategy",
	tickIntervalMs: 1_000,
	maxPositions: 5,
	maxOrderSizeUsdc: 100,
	maxDailyLossUsdc: 500,
	paperMode: true,
};
