/**
 * Opaque credential container — secrets never leak through toString,
 * JSON.stringify, or Node.js inspect.
 */

import { AuthError } from "../shared/errors.js";
import type { ApiKeySet, Credentials } from "./types.js";

// ── Private store ────────────────────────────────────────────────────

const store = new WeakMap<object, ApiKeySet>();

// ── Factory ──────────────────────────────────────────────────────────

/**
 * Creates opaque credentials from an API key set.
 * The returned Credentials object will redact its contents when stringified
 * or inspected, preventing accidental secret exposure in logs.
 *
 * @param keys - The API key, secret, and passphrase to seal
 * @returns Opaque Credentials that cannot be accidentally logged
 * @example
 * const credentials = createCredentials({
 *   apiKey: "abc123",
 *   secret: "mysecret",
 *   passphrase: "passphrase"
 * });
 * console.log(credentials); // Logs: [REDACTED]
 */
export function createCredentials(keys: ApiKeySet): Credentials {
	const obj: { __opaque: true; toString: () => string; toJSON: () => string } = Object.create(null);
	obj.__opaque = true as const;
	obj.toString = () => "[REDACTED]";
	obj.toJSON = () => "[REDACTED]";
	(obj as Record<symbol, unknown>)[Symbol.for("nodejs.util.inspect.custom")] = () => "[REDACTED]";
	store.set(obj, { ...keys });
	return obj as unknown as Credentials;
}

// ── Accessor ─────────────────────────────────────────────────────────

/**
 * Unwraps opaque credentials to retrieve the raw API key set.
 * This is the only way to access the underlying keys.
 *
 * @param credentials - The opaque credentials to unwrap
 * @returns The underlying ApiKeySet with apiKey, secret, and passphrase
 * @throws AuthError if the credentials object is invalid
 */
export function unwrapCredentials(credentials: Credentials): ApiKeySet {
	const keys = store.get(credentials as unknown as object);
	if (!keys) {
		throw new AuthError("Invalid credentials object");
	}
	return { ...keys };
}
