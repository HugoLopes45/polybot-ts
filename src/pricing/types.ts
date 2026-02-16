import type { Decimal } from "../shared/decimal.js";

/**
 * Input for Black-Scholes binary option pricing.
 */
export interface PricingInput {
	/** Current spot price / probability estimate (0-1). */
	readonly spot: Decimal;
	/** Implied volatility (annualized, e.g. 0.80 for 80%). */
	readonly vol: Decimal;
	/** Time to expiry in years (e.g. 1/365 for one day). */
	readonly timeToExpiry: Decimal;
	/** Risk-free rate (annualized, default 0). */
	readonly riskFreeRate?: Decimal;
}

/**
 * Result of Black-Scholes binary pricing.
 */
export interface PricingResult {
	/** Fair price of binary call (probability of finishing in-the-money). */
	readonly fairPrice: Decimal;
	/** Edge = (fair - market) / market. Positive means underpriced. */
	readonly edge: Decimal;
	/** Gamma factor = 1 / (spot * (1-spot) * sqrt(timeToExpiry)). Higher near 0.5. */
	readonly gammaFactor: Decimal;
	/** Kelly fraction = edge / odds. */
	readonly kellyFraction: Decimal;
	/** Expected value per dollar risked. */
	readonly expectedValue: Decimal;
}
