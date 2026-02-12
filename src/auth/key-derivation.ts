/**
 * L2 API key derivation — derives Polymarket API credentials from
 * an Ethereum signer using EIP-712 typed data signing.
 */

import { createHmac } from "node:crypto";
import type { EthSigner } from "../lib/ethereum/types.js";
import { SystemError } from "../shared/errors.js";
import type { TradingError } from "../shared/errors.js";
import { type Result, err, ok } from "../shared/result.js";
import type { ApiKeySet } from "./types.js";

// ── EIP-712 derivation parameters ───────────────────────────────────

const DERIVATION_DOMAIN = {
	name: "PolymarketApiKey",
	version: "1",
	chainId: 137,
} as const;

const DERIVATION_TYPES = {
	ApiKey: [{ name: "nonce", type: "uint256" }],
} as const;

// ── Key derivation ──────────────────────────────────────────────────

export async function deriveL2ApiKeys(
	signer: EthSigner,
	nonce = 0,
): Promise<Result<ApiKeySet, TradingError>> {
	try {
		const signature = await signer.signTypedData({
			domain: DERIVATION_DOMAIN,
			types: DERIVATION_TYPES,
			primaryType: "ApiKey",
			message: { nonce: BigInt(nonce) },
		});

		const hash = createHmac("sha256", signature).update("polymarket-api-key").digest("hex");

		const apiKey = hash.slice(0, 32);
		const secret = hash.slice(32, 64);

		const passphrase = createHmac("sha256", signature)
			.update("polymarket-passphrase")
			.digest("hex")
			.slice(0, 16);

		return ok({ apiKey, secret, passphrase });
	} catch {
		return err(new SystemError("Key derivation failed", { signerAddress: signer.address }));
	}
}
