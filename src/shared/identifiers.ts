/**
 * Domain primitive identifiers — branded types for compile-time safety.
 *
 * Each identifier wraps a string with a unique brand, preventing accidental
 * mixing (e.g., passing a ConditionId where a MarketTokenId is expected).
 */

// ── Brand infrastructure ─────────────────────────────────────────────

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

// ── Identifier types ─────────────────────────────────────────────────

export type ConditionId = Brand<string, "ConditionId">;
export type MarketTokenId = Brand<string, "MarketTokenId">;
export type ClientOrderId = Brand<string, "ClientOrderId">;
export type ExchangeOrderId = Brand<string, "ExchangeOrderId">;

// ── Factory functions with validation ────────────────────────────────

function createBrandedId<B extends string>(value: string, label: B): Brand<string, B> {
	if (value.length === 0) {
		throw new Error(`${label} cannot be empty`);
	}
	return value as Brand<string, B>;
}

export function conditionId(value: string): ConditionId {
	return createBrandedId(value, "ConditionId");
}

export function marketTokenId(value: string): MarketTokenId {
	return createBrandedId(value, "MarketTokenId");
}

export function clientOrderId(value: string): ClientOrderId {
	return createBrandedId(value, "ClientOrderId");
}

export function exchangeOrderId(value: string): ExchangeOrderId {
	return createBrandedId(value, "ExchangeOrderId");
}

// ── Utility: extract raw string ──────────────────────────────────────

export function idToString(
	id: ConditionId | MarketTokenId | ClientOrderId | ExchangeOrderId,
): string {
	return id as string;
}
