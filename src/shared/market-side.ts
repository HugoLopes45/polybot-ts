/**
 * MarketSide — binary market semantics.
 *
 * In Polymarket, every market has YES and NO outcomes.
 * Price of YES + Price of NO ≈ $1 USDC (minus spread).
 */

/** Binary outcome sides in a Polymarket market. */
export const MarketSide = {
	Yes: "yes",
	No: "no",
} as const;

export type MarketSide = (typeof MarketSide)[keyof typeof MarketSide];

/** Return the opposite market side (YES becomes NO and vice versa). */
export function oppositeSide(side: MarketSide): MarketSide {
	return side === MarketSide.Yes ? MarketSide.No : MarketSide.Yes;
}

/** Complement price: buy YES @ P ≈ sell NO @ (1 - P) */
export function complementPrice(price: number): number {
	return 1 - price;
}
