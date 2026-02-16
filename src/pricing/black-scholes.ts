import { Decimal } from "../shared/decimal.js";
import type { PricingInput, PricingResult } from "./types.js";

const EPSILON = 1e-6;
const MIN_SPOT = 0.01;
const MAX_SPOT = 0.99;

/**
 * Standard normal cumulative distribution function (CDF).
 * Uses Abramowitz & Stegun approximation for fast computation.
 *
 * @param x - Standard normal variable
 * @returns Probability that Z ≤ x
 */
export function normalCdf(x: number): number {
	if (x < -10) return 0;
	if (x > 10) return 1;

	const sign = x < 0 ? -1 : 1;
	const absX = Math.abs(x);

	const t = 1 / (1 + 0.2316419 * absX);
	const d = 0.3989423 * Math.exp((-absX * absX) / 2);
	const p =
		d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));

	if (sign > 0) {
		return 1 - p;
	}
	return p;
}

/**
 * Binary call option price using Black-Scholes model.
 * For prediction markets: fair_price = N(d2) where d2 uses log-odds transform.
 *
 * @param input - Pricing input (spot, vol, timeToExpiry, optional riskFreeRate)
 * @returns Fair price of binary call option
 */
export function binaryCallPrice(input: PricingInput): Decimal {
	const { spot, vol, timeToExpiry, riskFreeRate } = input;

	if (timeToExpiry.toNumber() < EPSILON) {
		return spot;
	}

	if (vol.toNumber() < EPSILON) {
		return spot.toNumber() > 0.5 ? Decimal.one() : Decimal.zero();
	}

	const s = Math.max(MIN_SPOT, Math.min(MAX_SPOT, spot.toNumber()));
	const logOdds = Math.log(s / (1 - s));
	const r = riskFreeRate?.toNumber() ?? 0;
	const v = vol.toNumber();
	const t = timeToExpiry.toNumber();

	const drift = r - (v * v) / 2;
	const volSqrtT = v * Math.sqrt(t);
	const d2 = (logOdds + drift * t) / volSqrtT;

	return Decimal.from(normalCdf(d2));
}

/**
 * Binary put option price.
 * Put price = 1 - Call price (put-call parity for binary options).
 *
 * @param input - Pricing input
 * @returns Fair price of binary put option
 */
export function binaryPutPrice(input: PricingInput): Decimal {
	const callPrice = binaryCallPrice(input);
	return Decimal.one().sub(callPrice);
}

/**
 * Calculate edge (relative mispricing).
 * Edge = (fair - market) / market
 * Positive edge means market is underpriced.
 *
 * @param fairPrice - Fair value from model
 * @param marketPrice - Current market price
 * @returns Edge as decimal
 */
export function calcEdge(fairPrice: Decimal, marketPrice: Decimal): Decimal {
	if (marketPrice.isZero()) {
		return Decimal.zero();
	}
	return fairPrice.sub(marketPrice).div(marketPrice);
}

/**
 * Calculate gamma factor (sensitivity to price movements).
 * Gamma = 1 / (spot * (1 - spot) * sqrt(timeToExpiry))
 * Higher values near spot=0.5 and shorter time frames.
 *
 * @param spot - Current spot price
 * @param timeToExpiry - Time to expiry in years
 * @returns Gamma factor
 */
export function calcGammaFactor(spot: Decimal, timeToExpiry: Decimal): Decimal {
	if (timeToExpiry.toNumber() < EPSILON) {
		return Decimal.zero();
	}

	const clampedSpot = Math.max(MIN_SPOT, Math.min(MAX_SPOT, spot.toNumber()));
	const s = Decimal.from(clampedSpot);

	const oneMinusS = Decimal.one().sub(s);
	const sqrtT = timeToExpiry.sqrt();

	return Decimal.one().div(s.mul(oneMinusS).mul(sqrtT));
}

/**
 * Calculate expected value per dollar risked.
 * EV = (fairPrice / marketPrice) - 1
 *
 * @param fairPrice - Fair value from model
 * @param marketPrice - Current market price
 * @returns Expected value
 */
export function calcExpectedValue(fairPrice: Decimal, marketPrice: Decimal): Decimal {
	if (marketPrice.isZero()) {
		return Decimal.zero();
	}
	return fairPrice.div(marketPrice).sub(Decimal.one());
}

/**
 * Full binary option pricing calculation.
 * Combines fair price, edge, gamma factor, Kelly fraction, and expected value.
 *
 * @param input - Pricing input
 * @param marketPrice - Current market price
 * @returns Complete pricing result
 */
export function priceBinary(input: PricingInput, marketPrice: Decimal): PricingResult {
	const fairPrice = binaryCallPrice(input);
	const edge = calcEdge(fairPrice, marketPrice);
	const gammaFactor = calcGammaFactor(input.spot, input.timeToExpiry);

	if (marketPrice.isZero()) {
		return {
			fairPrice,
			edge,
			gammaFactor,
			kellyFraction: Decimal.zero(),
			expectedValue: Decimal.zero(),
		};
	}

	const expectedValue = calcExpectedValue(fairPrice, marketPrice);
	const odds = Decimal.one().sub(marketPrice).div(marketPrice);
	const kellyFraction = odds.isZero() ? Decimal.zero() : edge.div(odds);

	return { fairPrice, edge, gammaFactor, kellyFraction, expectedValue };
}
