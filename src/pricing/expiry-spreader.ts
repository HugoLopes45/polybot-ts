/**
 * Time-to-expiry based spread scaling.
 * Near expiry → wider spreads (higher gamma risk, less time for mean reversion).
 */
import { Decimal } from "../shared/decimal.js";

export interface ExpirySpreadConfig {
	readonly baseSpreadBps: Decimal;
	readonly buckets: readonly ExpiryBucket[];
}

export interface ExpiryBucket {
	readonly maxRemainingMs: number;
	readonly multiplier: Decimal;
}

const DEFAULT_BUCKETS: readonly ExpiryBucket[] = [
	{ maxRemainingMs: 60_000, multiplier: Decimal.from("3.0") },
	{ maxRemainingMs: 180_000, multiplier: Decimal.from("2.0") },
	{ maxRemainingMs: 600_000, multiplier: Decimal.from("1.5") },
	{ maxRemainingMs: 3_600_000, multiplier: Decimal.from("1.2") },
];

/**
 * Calculate spread adjustment based on time remaining until expiry.
 * @param timeRemainingMs Milliseconds until market expiry
 * @param config Spread configuration with time buckets
 * @returns Adjusted spread in basis points
 */
export function calcExpirySpread(timeRemainingMs: number, config: ExpirySpreadConfig): Decimal {
	const buckets = config.buckets.length > 0 ? config.buckets : DEFAULT_BUCKETS;
	let multiplier = Decimal.one();

	for (const bucket of buckets) {
		if (timeRemainingMs <= bucket.maxRemainingMs) {
			multiplier = bucket.multiplier;
			break;
		}
	}

	return config.baseSpreadBps.mul(multiplier);
}

/** Create a default expiry spread config. */
export function defaultExpirySpreadConfig(baseSpreadBps: number): ExpirySpreadConfig {
	return {
		baseSpreadBps: Decimal.from(baseSpreadBps),
		buckets: DEFAULT_BUCKETS,
	};
}
