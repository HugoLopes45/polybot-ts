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

/** Unique identifier for a Polymarket condition (market). */
export type ConditionId = Brand<string, "ConditionId">;
/** Unique identifier for a specific outcome token (YES or NO). */
export type MarketTokenId = Brand<string, "MarketTokenId">;
/** SDK-generated order identifier, unique per session. */
export type ClientOrderId = Brand<string, "ClientOrderId">;
/** Exchange-assigned order identifier returned after submission. */
export type ExchangeOrderId = Brand<string, "ExchangeOrderId">;

// ── Factory functions with validation ────────────────────────────────

function createBrandedId<B extends string>(value: string, label: B): Brand<string, B> {
	if (value.length === 0) {
		throw new Error(`${label} cannot be empty`);
	}
	return value as Brand<string, B>;
}

/** Create a validated ConditionId from a raw string. Throws if empty. */
export function conditionId(value: string): ConditionId {
	return createBrandedId(value, "ConditionId");
}

/** Create a validated MarketTokenId from a raw string. Throws if empty. */
export function marketTokenId(value: string): MarketTokenId {
	return createBrandedId(value, "MarketTokenId");
}

/** Create a validated ClientOrderId from a raw string. Throws if empty. */
export function clientOrderId(value: string): ClientOrderId {
	return createBrandedId(value, "ClientOrderId");
}

/** Create a validated ExchangeOrderId from a raw string. Throws if empty. */
export function exchangeOrderId(value: string): ExchangeOrderId {
	return createBrandedId(value, "ExchangeOrderId");
}

// ── Utility: extract raw string ──────────────────────────────────────

/** Extract the raw string from any branded identifier type. */
export function idToString(
	id: ConditionId | MarketTokenId | ClientOrderId | ExchangeOrderId,
): string {
	return id as string;
}
