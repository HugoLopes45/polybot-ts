/**
 * Ethereum library wrapper — type definitions.
 *
 * Abstracts Ethereum signing operations behind domain-agnostic interfaces.
 * Actual implementation uses viem but domain code never imports viem directly.
 */

// ── Brand infrastructure ─────────────────────────────────────────────

declare const __brand: unique symbol;
/**
 * Branded type helper — creates a nominal type for domain primitives.
 * @template T The underlying primitive type
 * @template B The brand identifier
 */
type Brand<T, B extends string> = T & { readonly [__brand]: B };

// ── Domain types ─────────────────────────────────────────────────────

/**
 * Ethereum address — branded type to prevent accidental string mixing.
 * @example "0x742d35Cc6634C0532925a3b844Bc9e7595f0fEb1"
 */
export type EthAddress = Brand<string, "EthAddress">;

/**
 * Parameters for signing typed data (EIP-712).
 */
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

/**
 * Ethereum signer — domain-agnostic interface for signing messages and typed data.
 * Abstracts specific library implementation (viem).
 */
export interface EthSigner {
	readonly address: EthAddress;
	signMessage(message: string): Promise<string>;
	signTypedData(params: SignTypedDataParams): Promise<string>;
}
