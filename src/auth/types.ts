/**
 * Auth bounded context — type definitions.
 *
 * Credentials are opaque branded types that prevent accidental logging
 * of secrets. ApiKeySet holds the raw material before sealing.
 */

// ── Brand infrastructure ─────────────────────────────────────────────

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

// ── Domain types ─────────────────────────────────────────────────────

export interface ApiKeySet {
	readonly apiKey: string;
	readonly secret: string;
	readonly passphrase: string;
}

export type Credentials = Brand<{ readonly __opaque: true }, "Credentials">;
