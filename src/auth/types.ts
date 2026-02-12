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

/**
 * Raw API key set containing authentication credentials for the Polymarket API.
 * This holds the plaintext keys before being sealed into an opaque Credentials type.
 */
export interface ApiKeySet {
	/** The API key identifier */
	readonly apiKey: string;
	/** The HMAC secret used for request signing */
	readonly secret: string;
	/** The passphrase/nonce used for additional authentication */
	readonly passphrase: string;
}

/**
 * Opaque credential container that prevents accidental secret exposure.
 * Implements custom toString, toJSON, and inspect methods that always return
 * "[REDACTED]", ensuring secrets never leak through logging or inspection.
 *
 * Use createCredentials() to create from ApiKeySet, and unwrapCredentials() to retrieve.
 */
export type Credentials = Brand<{ readonly __opaque: true }, "Credentials">;
