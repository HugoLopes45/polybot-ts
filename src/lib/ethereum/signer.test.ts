import { describe, expect, it } from "vitest";
import { createSigner } from "./signer.js";
import type { SignTypedDataParams } from "./types.js";

const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const EXPECTED_ADDRESS = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";

const TEST_TYPED_DATA: SignTypedDataParams = {
	domain: { name: "Test", version: "1", chainId: 1 },
	types: { Msg: [{ name: "contents", type: "string" }] },
	primaryType: "Msg",
	message: { contents: "hello" },
};

describe("createSigner", () => {
	it("derives correct address from known private key", () => {
		const signer = createSigner(TEST_PRIVATE_KEY);
		expect(signer.address.toLowerCase()).toBe(EXPECTED_ADDRESS);
	});

	it("address is branded EthAddress (string underneath)", () => {
		const signer = createSigner(TEST_PRIVATE_KEY);
		expect(typeof signer.address).toBe("string");
	});

	it("signMessage returns hex string", async () => {
		const signer = createSigner(TEST_PRIVATE_KEY);
		const signature = await signer.signMessage("hello");
		expect(signature.startsWith("0x")).toBe(true);
		expect(signature.length).toBeGreaterThan(2);
	});

	it("signMessage is deterministic", async () => {
		const signer = createSigner(TEST_PRIVATE_KEY);
		const sig1 = await signer.signMessage("hello");
		const sig2 = await signer.signMessage("hello");
		expect(sig1).toBe(sig2);
	});

	it("signTypedData returns hex string", async () => {
		const signer = createSigner(TEST_PRIVATE_KEY);
		const signature = await signer.signTypedData(TEST_TYPED_DATA);
		expect(signature.startsWith("0x")).toBe(true);
		expect(signature.length).toBeGreaterThan(2);
	});

	it("signTypedData is deterministic", async () => {
		const signer = createSigner(TEST_PRIVATE_KEY);
		const sig1 = await signer.signTypedData(TEST_TYPED_DATA);
		const sig2 = await signer.signTypedData(TEST_TYPED_DATA);
		expect(sig1).toBe(sig2);
	});

	it("throws for invalid key without leaking key material", () => {
		expect(() => createSigner("not-a-key")).toThrow("Invalid private key format");
	});

	it("throws for key with 0x prefix but wrong length", () => {
		expect(() => createSigner("0xdead")).toThrow("Invalid private key format");
	});

	it("JSON.stringify does not expose key material", () => {
		const signer = createSigner(TEST_PRIVATE_KEY);
		const json = JSON.stringify(signer);
		expect(json).not.toContain(TEST_PRIVATE_KEY.slice(2));
	});

	it("toString returns [EthSigner]", () => {
		const signer = createSigner(TEST_PRIVATE_KEY);
		expect(String(signer)).toBe("[EthSigner]");
	});
});
