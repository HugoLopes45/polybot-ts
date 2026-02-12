import { describe, expect, it } from "vitest";
import { AuthError } from "../shared/errors.js";
import { createCredentials, unwrapCredentials } from "./credentials.js";
import { buildL2Headers } from "./l2-headers.js";
import type { ApiKeySet } from "./types.js";

const TEST_KEYS: ApiKeySet = {
	apiKey: "0xMyAddress",
	secret: "super-secret-key",
	passphrase: "my-passphrase",
};

describe("credentials", () => {
	describe("opacity", () => {
		it("toString returns [REDACTED]", () => {
			const creds = createCredentials(TEST_KEYS);
			expect(String(creds)).toBe("[REDACTED]");
		});

		it("JSON.stringify returns quoted [REDACTED]", () => {
			const creds = createCredentials(TEST_KEYS);
			expect(JSON.stringify(creds)).toBe('"[REDACTED]"');
		});

		it("toJSON returns [REDACTED]", () => {
			const creds = createCredentials(TEST_KEYS);
			const obj = creds as unknown as { toJSON(): string };
			expect(obj.toJSON()).toBe("[REDACTED]");
		});

		it("Node.js inspect returns [REDACTED]", () => {
			const creds = createCredentials(TEST_KEYS);
			const inspectable = creds as unknown as Record<symbol, () => string>;
			const inspectFn = inspectable[Symbol.for("nodejs.util.inspect.custom")];
			expect(inspectFn()).toBe("[REDACTED]");
		});
	});

	describe("round-trip", () => {
		it("unwrapCredentials returns the original ApiKeySet", () => {
			const creds = createCredentials(TEST_KEYS);
			const unwrapped = unwrapCredentials(creds);
			expect(unwrapped).toEqual(TEST_KEYS);
		});

		it("unwrapped keys match input exactly", () => {
			const creds = createCredentials(TEST_KEYS);
			const unwrapped = unwrapCredentials(creds);
			expect(unwrapped.apiKey).toBe("0xMyAddress");
			expect(unwrapped.secret).toBe("super-secret-key");
			expect(unwrapped.passphrase).toBe("my-passphrase");
		});

		it("returns defensive copy — caller mutation does not corrupt store", () => {
			const creds = createCredentials(TEST_KEYS);
			const first = unwrapCredentials(creds);
			// Mutate the returned object
			(first as { apiKey: string }).apiKey = "CORRUPTED";
			const second = unwrapCredentials(creds);
			expect(second.apiKey).toBe("0xMyAddress");
		});
	});

	describe("invalid credentials", () => {
		it("unwrapCredentials throws AuthError for non-credential object", () => {
			const fake = {} as ReturnType<typeof createCredentials>;
			expect(() => unwrapCredentials(fake)).toThrow(AuthError);
		});
	});
});

describe("buildL2Headers", () => {
	const creds = createCredentials(TEST_KEYS);
	const timestamp = 1700000000;
	const method = "POST";
	const path = "/order";

	it("returns object with all required header keys", () => {
		const headers = buildL2Headers(creds, timestamp, method, path);
		expect(headers).toHaveProperty("POLY_ADDRESS");
		expect(headers).toHaveProperty("POLY_SIGNATURE");
		expect(headers).toHaveProperty("POLY_TIMESTAMP");
		expect(headers).toHaveProperty("POLY_NONCE");
	});

	it("produces deterministic output for same inputs", () => {
		const a = buildL2Headers(creds, timestamp, method, path, '{"side":"buy"}');
		const b = buildL2Headers(creds, timestamp, method, path, '{"side":"buy"}');
		expect(a).toEqual(b);
	});

	it("signature is a valid HMAC-SHA256 hex string (64 chars)", () => {
		const headers = buildL2Headers(creds, timestamp, method, path);
		expect(headers.POLY_SIGNATURE).toMatch(/^[0-9a-f]{64}$/);
	});

	describe("input validation", () => {
		it("throws AuthError when secret is empty", () => {
			const emptyCreds = createCredentials({ apiKey: "k", secret: "", passphrase: "p" });
			expect(() => buildL2Headers(emptyCreds, timestamp, method, path)).toThrow(AuthError);
		});

		it("throws AuthError when timestamp is NaN", () => {
			expect(() => buildL2Headers(creds, Number.NaN, method, path)).toThrow(AuthError);
		});

		it("throws AuthError when timestamp is zero", () => {
			expect(() => buildL2Headers(creds, 0, method, path)).toThrow(AuthError);
		});

		it("throws AuthError when method contains lowercase", () => {
			expect(() => buildL2Headers(creds, timestamp, "post", path)).toThrow(AuthError);
		});

		it("throws AuthError when path does not start with /", () => {
			expect(() => buildL2Headers(creds, timestamp, method, "order")).toThrow(AuthError);
		});
	});
});
