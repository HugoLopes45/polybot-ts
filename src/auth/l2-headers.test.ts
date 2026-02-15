import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AuthError } from "../shared/errors.js";
import { createCredentials } from "./credentials.js";
import { buildL2Headers } from "./l2-headers.js";
import type { ApiKeySet } from "./types.js";

const TEST_KEYS: ApiKeySet = {
	apiKey: "0xMyAddress",
	secret: "super-secret-key",
	passphrase: "my-passphrase",
};

describe("l2-headers", () => {
	describe("valid signature generation", () => {
		it("generates correct signature for GET request without body", () => {
			const creds = createCredentials(TEST_KEYS);
			const timestamp = 1700000000;
			const method = "GET";
			const path = "/orders";

			const headers = buildL2Headers(creds, timestamp, method, path);

			const expectedMessage = String(timestamp) + method + path;
			const expectedSignature = createHmac("sha256", TEST_KEYS.secret)
				.update(expectedMessage)
				.digest("hex");

			expect(headers.POLY_SIGNATURE).toBe(expectedSignature);
			expect(headers.POLY_ADDRESS).toBe(TEST_KEYS.apiKey);
			expect(headers.POLY_TIMESTAMP).toBe(String(timestamp));
			expect(headers.POLY_NONCE).toBe(TEST_KEYS.passphrase);
		});

		it("generates correct signature for POST request with body", () => {
			const creds = createCredentials(TEST_KEYS);
			const timestamp = 1700000000;
			const method = "POST";
			const path = "/order";
			const body = '{"side":"buy","size":"100"}';

			const headers = buildL2Headers(creds, timestamp, method, path, body);

			const expectedMessage = String(timestamp) + method + path + body;
			const expectedSignature = createHmac("sha256", TEST_KEYS.secret)
				.update(expectedMessage)
				.digest("hex");

			expect(headers.POLY_SIGNATURE).toBe(expectedSignature);
		});

		it("generates correct signature for DELETE request", () => {
			const creds = createCredentials(TEST_KEYS);
			const timestamp = 1700000050;
			const method = "DELETE";
			const path = "/order/123";

			const headers = buildL2Headers(creds, timestamp, method, path);

			const expectedMessage = String(timestamp) + method + path;
			const expectedSignature = createHmac("sha256", TEST_KEYS.secret)
				.update(expectedMessage)
				.digest("hex");

			expect(headers.POLY_SIGNATURE).toBe(expectedSignature);
		});
	});

	describe("empty secret rejection", () => {
		it("throws AuthError when secret is empty string", () => {
			const creds = createCredentials({
				apiKey: "k",
				secret: "",
				passphrase: "p",
			});
			expect(() => buildL2Headers(creds, 1700000000, "GET", "/orders")).toThrow(AuthError);
		});
	});

	describe("invalid timestamp", () => {
		it("throws AuthError when timestamp is NaN", () => {
			const creds = createCredentials(TEST_KEYS);
			expect(() => buildL2Headers(creds, Number.NaN, "GET", "/orders")).toThrow(AuthError);
		});

		it("throws AuthError when timestamp is zero", () => {
			const creds = createCredentials(TEST_KEYS);
			expect(() => buildL2Headers(creds, 0, "GET", "/orders")).toThrow(AuthError);
		});

		it("throws AuthError when timestamp is negative", () => {
			const creds = createCredentials(TEST_KEYS);
			expect(() => buildL2Headers(creds, -100, "GET", "/orders")).toThrow(AuthError);
		});

		it("throws AuthError when timestamp is Infinity", () => {
			const creds = createCredentials(TEST_KEYS);
			expect(() => buildL2Headers(creds, Number.POSITIVE_INFINITY, "GET", "/orders")).toThrow(
				AuthError,
			);
		});

		it("throws AuthError when timestamp is undefined", () => {
			const creds = createCredentials(TEST_KEYS);
			// @ts-expect-error - testing invalid input
			expect(() => buildL2Headers(creds, undefined, "GET", "/orders")).toThrow(AuthError);
		});
	});

	describe("invalid method", () => {
		it("throws AuthError when method contains lowercase letters", () => {
			const creds = createCredentials(TEST_KEYS);
			expect(() => buildL2Headers(creds, 1700000000, "get", "/orders")).toThrow(AuthError);
		});

		it("throws AuthError when method contains numbers", () => {
			const creds = createCredentials(TEST_KEYS);
			expect(() => buildL2Headers(creds, 1700000000, "GET1", "/orders")).toThrow(AuthError);
		});

		it("throws AuthError when method contains special characters", () => {
			const creds = createCredentials(TEST_KEYS);
			expect(() => buildL2Headers(creds, 1700000000, "GET!", "/orders")).toThrow(AuthError);
		});

		it("throws AuthError when method is empty string", () => {
			const creds = createCredentials(TEST_KEYS);
			expect(() => buildL2Headers(creds, 1700000000, "", "/orders")).toThrow(AuthError);
		});
	});

	describe("invalid path", () => {
		it("throws AuthError when path does not start with /", () => {
			const creds = createCredentials(TEST_KEYS);
			expect(() => buildL2Headers(creds, 1700000000, "GET", "orders")).toThrow(AuthError);
		});

		it("throws AuthError when path is empty string", () => {
			const creds = createCredentials(TEST_KEYS);
			expect(() => buildL2Headers(creds, 1700000000, "GET", "")).toThrow(AuthError);
		});

		it("throws AuthError when path starts with space", () => {
			const creds = createCredentials(TEST_KEYS);
			expect(() => buildL2Headers(creds, 1700000000, "GET", " /orders")).toThrow(AuthError);
		});
	});

	describe("body inclusion/exclusion", () => {
		it("includes body in signature when provided", () => {
			const creds = createCredentials(TEST_KEYS);
			const timestamp = 1700000000;
			const method = "POST";
			const path = "/order";
			const body = '{"side":"buy"}';

			const headers = buildL2Headers(creds, timestamp, method, path, body);

			const messageWithBody = String(timestamp) + method + path + body;
			const expectedSignature = createHmac("sha256", TEST_KEYS.secret)
				.update(messageWithBody)
				.digest("hex");

			expect(headers.POLY_SIGNATURE).toBe(expectedSignature);
		});

		it("excludes body from signature when undefined", () => {
			const creds = createCredentials(TEST_KEYS);
			const timestamp = 1700000000;
			const method = "POST";
			const path = "/order";

			const headers = buildL2Headers(creds, timestamp, method, path);

			const messageWithoutBody = String(timestamp) + method + path;
			const expectedSignature = createHmac("sha256", TEST_KEYS.secret)
				.update(messageWithoutBody)
				.digest("hex");

			expect(headers.POLY_SIGNATURE).toBe(expectedSignature);
		});

		it("produces different signatures with and without body", () => {
			const creds = createCredentials(TEST_KEYS);
			const timestamp = 1700000000;
			const method = "POST";
			const path = "/order";
			const body = '{"side":"buy"}';

			const withBody = buildL2Headers(creds, timestamp, method, path, body);
			const withoutBody = buildL2Headers(creds, timestamp, method, path);

			expect(withBody.POLY_SIGNATURE).not.toBe(withoutBody.POLY_SIGNATURE);
		});

		it("handles empty string body correctly", () => {
			const creds = createCredentials(TEST_KEYS);
			const timestamp = 1700000000;
			const method = "POST";
			const path = "/order";
			const body = "";

			const headers = buildL2Headers(creds, timestamp, method, path, body);

			const messageWithEmptyBody = String(timestamp) + method + path + body;
			const expectedSignature = createHmac("sha256", TEST_KEYS.secret)
				.update(messageWithEmptyBody)
				.digest("hex");

			expect(headers.POLY_SIGNATURE).toBe(expectedSignature);
		});

		it("handles complex JSON body correctly", () => {
			const creds = createCredentials(TEST_KEYS);
			const timestamp = 1700000000;
			const method = "POST";
			const path = "/order";
			const body = JSON.stringify({
				side: "buy",
				size: "100.50",
				market: "0x1234",
				expiresAt: 1700000100,
			});

			const headers = buildL2Headers(creds, timestamp, method, path, body);

			const expectedMessage = String(timestamp) + method + path + body;
			const expectedSignature = createHmac("sha256", TEST_KEYS.secret)
				.update(expectedMessage)
				.digest("hex");

			expect(headers.POLY_SIGNATURE).toBe(expectedSignature);
		});
	});

	describe("method normalization", () => {
		it("uses uppercase method in signature (implementation normalizes)", () => {
			const creds = createCredentials(TEST_KEYS);
			const timestamp = 1700000000;
			const method = "POST";
			const path = "/order";

			const headers = buildL2Headers(creds, timestamp, method, path);

			const expectedMessage = `${timestamp}POST${path}`;
			const expectedSignature = createHmac("sha256", TEST_KEYS.secret)
				.update(expectedMessage)
				.digest("hex");

			expect(headers.POLY_SIGNATURE).toBe(expectedSignature);
		});
	});
});
