/**
 * L2 authentication headers — HMAC-SHA256 signing for Polymarket API.
 */

import { createHmac } from "node:crypto";
import { AuthError } from "../shared/errors.js";
import { unwrapCredentials } from "./credentials.js";
import type { Credentials } from "./types.js";

const METHOD_RE = /^[A-Z]+$/;

/**
 * Builds L2 authentication headers for the Polymarket API using HMAC-SHA256
 * signing. The signature is computed from the timestamp, HTTP method, path,
 * and optional request body.
 *
 * @param credentials - The opaque credentials (unwrapped internally)
 * @param timestamp - Unix timestamp in seconds
 * @param method - HTTP method (e.g., "GET", "POST")
 * @param path - API endpoint path (must start with /)
 * @param body - Optional request body for POST/PUT requests
 * @returns Record containing POLY_ADDRESS, POLY_SIGNATURE, POLY_TIMESTAMP, and POLY_NONCE headers
 * @throws AuthError if credentials are invalid or parameters are malformed
 * @example
 * const headers = buildL2Headers(credentials, Date.now() / 1000, "GET", "/orders");
 */
export function buildL2Headers(
	credentials: Credentials,
	timestamp: number,
	method: string,
	path: string,
	body?: string,
): Record<string, string> {
	const { apiKey, secret, passphrase } = unwrapCredentials(credentials);
	if (!secret || secret.length === 0) {
		throw new AuthError("HMAC secret must not be empty");
	}
	if (!Number.isFinite(timestamp) || timestamp <= 0) {
		throw new AuthError("Timestamp must be a positive finite number");
	}
	if (!METHOD_RE.test(method)) {
		throw new AuthError("Method must contain only uppercase ASCII letters");
	}
	if (!path.startsWith("/")) {
		throw new AuthError("Path must start with /");
	}
	const message = String(timestamp) + method.toUpperCase() + path + (body ?? "");
	const signature = createHmac("sha256", secret).update(message).digest("hex");

	return {
		POLY_ADDRESS: apiKey,
		POLY_SIGNATURE: signature,
		POLY_TIMESTAMP: String(timestamp),
		POLY_NONCE: passphrase,
	};
}
