/**
 * Ethereum library wrapper — type definitions.
 *
 * Abstracts Ethereum signing operations behind domain-agnostic interfaces.
 * Actual implementation uses viem but domain code never imports viem directly.
 */

// ── Brand infrastructure ─────────────────────────────────────────────

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

// ── Domain types ─────────────────────────────────────────────────────

export type EthAddress = Brand<string, "EthAddress">;

export interface SignTypedDataParams {
	readonly domain: {
		readonly name?: string;
		readonly version?: string;
		readonly chainId?: number;
		readonly verifyingContract?: string;
	};
	readonly types: Record<string, readonly { readonly name: string; readonly type: string }[]>;
	readonly primaryType: string;
	readonly message: Record<string, unknown>;
}

export interface EthSigner {
	readonly address: EthAddress;
	signMessage(message: string): Promise<string>;
	signTypedData(params: SignTypedDataParams): Promise<string>;
}
