/**
 * Ethereum signer wrapper — abstracts viem's account signing behind
 * the domain-agnostic EthSigner interface.
 */

import { privateKeyToAccount } from "viem/accounts";
import type { EthAddress, EthSigner, SignTypedDataParams } from "./types.js";

const HEX_KEY_RE = /^0x[0-9a-fA-F]{64}$/;

export function createSigner(privateKey: string): EthSigner {
	if (!HEX_KEY_RE.test(privateKey)) {
		throw new Error("Invalid private key format");
	}
	let account: ReturnType<typeof privateKeyToAccount>;
	try {
		account = privateKeyToAccount(privateKey as `0x${string}`);
	} catch {
		throw new Error("Invalid private key format");
	}

	const signer: EthSigner = {
		address: account.address.toLowerCase() as EthAddress,

		async signMessage(message: string): Promise<string> {
			return account.signMessage({ message });
		},

		async signTypedData(params: SignTypedDataParams): Promise<string> {
			return account.signTypedData({
				domain: params.domain as Record<string, unknown>,
				types: params.types as Record<string, { name: string; type: string }[]>,
				primaryType: params.primaryType,
				message: params.message,
			});
		},
	};

	Object.defineProperty(signer, "toString", { value: () => "[EthSigner]", enumerable: false });
	Object.defineProperty(signer, "toJSON", { value: () => "[EthSigner]", enumerable: false });

	return signer;
}
