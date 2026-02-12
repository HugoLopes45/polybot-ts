/**
 * OrderIntent factories — type-safe order creation.
 *
 * Factory functions validate inputs and return frozen (immutable) objects.
 */

import type { Decimal } from "../shared/decimal.js";
import type { ConditionId, MarketTokenId } from "../shared/identifiers.js";
import { MarketSide } from "../shared/market-side.js";
import { OrderDirection, type SdkOrderIntent } from "../signal/types.js";

function validateIntent(price: Decimal, size: Decimal): void {
	if (price.isNegative()) {
		throw new Error(`Order price must be non-negative, got ${price.toString()}`);
	}
	if (size.isZero() || size.isNegative()) {
		throw new Error(`Order size must be positive, got ${size.toString()}`);
	}
}

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
