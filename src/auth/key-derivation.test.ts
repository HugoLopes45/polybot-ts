import { describe, expect, it } from "vitest";
import { createSigner } from "../lib/ethereum/signer.js";
import { deriveL2ApiKeys } from "./key-derivation.js";

const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

describe("deriveL2ApiKeys", () => {
	it("returns ok result with apiKey, secret, and passphrase", async () => {
		const signer = createSigner(TEST_PRIVATE_KEY);
		const result = await deriveL2ApiKeys(signer);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toHaveProperty("apiKey");
		expect(result.value).toHaveProperty("secret");
		expect(result.value).toHaveProperty("passphrase");
	});

	it("apiKey is 32-char hex string", async () => {
		const signer = createSigner(TEST_PRIVATE_KEY);
		const result = await deriveL2ApiKeys(signer);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.apiKey).toMatch(/^[0-9a-f]{32}$/);
	});

	it("secret is 32-char hex string", async () => {
		const signer = createSigner(TEST_PRIVATE_KEY);
		const result = await deriveL2ApiKeys(signer);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.secret).toMatch(/^[0-9a-f]{32}$/);
	});

	it("passphrase is 16-char hex string", async () => {
		const signer = createSigner(TEST_PRIVATE_KEY);
		const result = await deriveL2ApiKeys(signer);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.passphrase).toMatch(/^[0-9a-f]{16}$/);
	});

	it("derivation is deterministic", async () => {
		const signer = createSigner(TEST_PRIVATE_KEY);
		const result1 = await deriveL2ApiKeys(signer);
		const result2 = await deriveL2ApiKeys(signer);
		expect(result1.ok).toBe(true);
		expect(result2.ok).toBe(true);
		if (!result1.ok || !result2.ok) return;
		expect(result1.value).toEqual(result2.value);
	});

	it("different nonce yields different keys", async () => {
		const signer = createSigner(TEST_PRIVATE_KEY);
		const result0 = await deriveL2ApiKeys(signer, 0);
		const result1 = await deriveL2ApiKeys(signer, 1);
		expect(result0.ok).toBe(true);
		expect(result1.ok).toBe(true);
		if (!result0.ok || !result1.ok) return;
		expect(result0.value.apiKey).not.toBe(result1.value.apiKey);
	});

	it("returns err when signer fails", async () => {
		const failingSigner = {
			address: "0xdead" as ReturnType<typeof createSigner>["address"],
			signMessage: async () => "0x",
			signTypedData: async () => {
				throw new Error("signing failed");
			},
		};
		const result = await deriveL2ApiKeys(failingSigner);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.message).toBe("Key derivation failed");
		expect(result.error.code).toBe("SYSTEM_ERROR");
	});

	it("error message does not leak upstream error details", async () => {
		const failingSigner = {
			address: "0xdead" as ReturnType<typeof createSigner>["address"],
			signMessage: async () => "0x",
			signTypedData: async () => {
				throw new Error("secret key 0xabc123 invalid");
			},
		};
		const result = await deriveL2ApiKeys(failingSigner);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.message).not.toContain("0xabc123");
		expect(result.error.message).toBe("Key derivation failed");
	});
});
