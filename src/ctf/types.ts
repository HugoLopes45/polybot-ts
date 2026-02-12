/**
 * CTF (Conditional Token Framework) domain types.
 *
 * Defines the core types for token resolution, split/merge/redeem
 * operations, and CTF contract configuration.
 */

import type { EthAddress } from "../lib/ethereum/types.js";
import type { ConditionId, MarketTokenId } from "../shared/identifiers.js";

export type CtfOperation = "split" | "merge" | "redeem";

export interface TokenInfo {
	readonly conditionId: ConditionId;
	readonly yesTokenId: MarketTokenId;
	readonly noTokenId: MarketTokenId;
}

export interface CtfConfig {
	readonly ctfAddress: EthAddress;
	readonly collateralAddress: EthAddress;
}
