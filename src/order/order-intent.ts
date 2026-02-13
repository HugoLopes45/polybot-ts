/**
 * OrderIntent factories — type-safe order creation.
 *
 * Factory functions validate inputs and return frozen (immutable) objects.
 */

import { Decimal } from "../shared/decimal.js";
import type { ConditionId, MarketTokenId } from "../shared/identifiers.js";
import { MarketSide } from "../shared/market-side.js";
import { OrderDirection, type SdkOrderIntent } from "../signal/types.js";

function validateIntent(price: Decimal, size: Decimal): void {
	if (price.isNegative()) {
		throw new Error(`Order price must be non-negative, got ${price.toString()}`);
	}
	if (price.gt(Decimal.one())) {
		throw new Error(
			`Order price must not exceed 1.0 for prediction markets, got ${price.toString()}`,
		);
	}
	if (size.isZero() || size.isNegative()) {
		throw new Error(`Order size must be positive, got ${size.toString()}`);
	}
}

/**
 * Creates a BUY order intent for a YES token.
 * @param conditionId - The condition ID for the market
 * @param tokenId - The market token ID for the YES outcome
 * @param price - Limit price (must be non-negative)
 * @param size - Order size (must be positive)
 * @returns Frozen SdkOrderIntent for buying YES
 * @throws Error if price is negative or size is zero/negative
 *
 * @example
 * ```ts
 * const intent = buyYes(conditionId, tokenId, d(0.60), d(10));
 * ```
 */
export function buyYes(
	conditionId: ConditionId,
	tokenId: MarketTokenId,
	price: Decimal,
	size: Decimal,
): SdkOrderIntent {
	validateIntent(price, size);
	return Object.freeze({
		conditionId,
		tokenId,
		side: MarketSide.Yes,
		direction: OrderDirection.Buy,
		price,
		size,
	});
}

/**
 * Creates a BUY order intent for a NO token.
 * @param conditionId - The condition ID for the market
 * @param tokenId - The market token ID for the NO outcome
 * @param price - Limit price (must be non-negative)
 * @param size - Order size (must be positive)
 * @returns Frozen SdkOrderIntent for buying NO
 * @throws Error if price is negative or size is zero/negative
 *
 * @example
 * ```ts
 * const intent = buyNo(conditionId, tokenId, d(0.40), d(10));
 * ```
 */
export function buyNo(
	conditionId: ConditionId,
	tokenId: MarketTokenId,
	price: Decimal,
	size: Decimal,
): SdkOrderIntent {
	validateIntent(price, size);
	return Object.freeze({
		conditionId,
		tokenId,
		side: MarketSide.No,
		direction: OrderDirection.Buy,
		price,
		size,
	});
}

/**
 * Creates a SELL order intent for a YES token.
 * @param conditionId - The condition ID for the market
 * @param tokenId - The market token ID for the YES outcome
 * @param price - Limit price (must be non-negative)
 * @param size - Order size (must be positive)
 * @returns Frozen SdkOrderIntent for selling YES
 * @throws Error if price is negative or size is zero/negative
 *
 * @example
 * ```ts
 * const intent = sellYes(conditionId, tokenId, d(0.60), d(10));
 * ```
 */
export function sellYes(
	conditionId: ConditionId,
	tokenId: MarketTokenId,
	price: Decimal,
	size: Decimal,
): SdkOrderIntent {
	validateIntent(price, size);
	return Object.freeze({
		conditionId,
		tokenId,
		side: MarketSide.Yes,
		direction: OrderDirection.Sell,
		price,
		size,
	});
}

/**
 * Creates a SELL order intent for a NO token.
 * @param conditionId - The condition ID for the market
 * @param tokenId - The market token ID for the NO outcome
 * @param price - Limit price (must be non-negative)
 * @param size - Order size (must be positive)
 * @returns Frozen SdkOrderIntent for selling NO
 * @throws Error if price is negative or size is zero/negative
 *
 * @example
 * ```ts
 * const intent = sellNo(conditionId, tokenId, d(0.40), d(10));
 * ```
 */
export function sellNo(
	conditionId: ConditionId,
	tokenId: MarketTokenId,
	price: Decimal,
	size: Decimal,
): SdkOrderIntent {
	validateIntent(price, size);
	return Object.freeze({
		conditionId,
		tokenId,
		side: MarketSide.No,
		direction: OrderDirection.Sell,
		price,
		size,
	});
}
