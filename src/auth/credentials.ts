/**
 * Opaque credential container — secrets never leak through toString,
 * JSON.stringify, or Node.js inspect.
 */

import { AuthError } from "../shared/errors.js";
import type { ApiKeySet, Credentials } from "./types.js";

// ── Private store ────────────────────────────────────────────────────

const store = new WeakMap<object, ApiKeySet>();

// ── Factory ──────────────────────────────────────────────────────────

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

export function unwrapCredentials(credentials: Credentials): ApiKeySet {
	const keys = store.get(credentials as unknown as object);
	if (!keys) {
		throw new AuthError("Invalid credentials object");
	}
	return { ...keys };
}
