/**
 * L2 authentication headers — HMAC-SHA256 signing for Polymarket API.
 */

import { createHmac } from "node:crypto";
import { AuthError } from "../shared/errors.js";
import { unwrapCredentials } from "./credentials.js";
import type { Credentials } from "./types.js";

const METHOD_RE = /^[A-Z]+$/;

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
