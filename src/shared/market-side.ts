/**
 * MarketSide — binary market semantics.
 *
 * In Polymarket, every market has YES and NO outcomes.
 * Price of YES + Price of NO ≈ $1 USDC (minus spread).
 */

export const MarketSide = {
	Yes: "yes",
	No: "no",
} as const;

export type MarketSide = (typeof MarketSide)[keyof typeof MarketSide];

export function oppositeSide(side: MarketSide): MarketSide {
	return side === MarketSide.Yes ? MarketSide.No : MarketSide.Yes;
}

/** Complement price: buy YES @ P ≈ sell NO @ (1 - P) */
export function complementPrice(price: number): number {
	return 1 - price;
}
