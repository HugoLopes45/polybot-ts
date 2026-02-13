import type { ContractWriter } from "../lib/ethereum/contracts.js";
import type { Decimal } from "../shared/decimal.js";
import type { TradingError } from "../shared/errors.js";
import type { ConditionId } from "../shared/identifiers.js";
import type { Result } from "../shared/result.js";
import type { CtfConfig } from "./types.js";

/**
 * Thin wrapper around ContractWriter for Conditional Token Framework operations.
 *
 * Delegates split, merge, and redeem calls to the underlying contract
 * writer with the correct function names and argument shapes.
 *
 * @example
 * ```ts
 * const ctf = new CtfClient(config, contractWriter);
 * const result = await ctf.split(conditionId, Decimal.from("100"));
 * ```
 */
export class CtfClient {
	private readonly config: CtfConfig;
	private readonly writer: ContractWriter;

	constructor(config: CtfConfig, writer: ContractWriter) {
		this.config = config;
		this.writer = writer;
	}

	/**
	 * Splits collateral into YES and NO outcome tokens.
	 * @param conditionId - The market condition to split
	 * @param amount - Amount of collateral to split
	 * @returns Transaction hash on success
	 */
	async split(conditionId: ConditionId, amount: Decimal): Promise<Result<string, TradingError>> {
		return this.writer.write("splitPosition", [
			conditionId,
			this.config.collateralAddress,
			amount.toString(),
		]);
	}

	/**
	 * Merges YES and NO outcome tokens back into collateral.
	 * @param conditionId - The market condition to merge
	 * @param amount - Amount of tokens to merge
	 * @returns Transaction hash on success
	 */
	async merge(conditionId: ConditionId, amount: Decimal): Promise<Result<string, TradingError>> {
		return this.writer.write("mergePositions", [
			conditionId,
			this.config.collateralAddress,
			amount.toString(),
		]);
	}

	/**
	 * Redeems winning outcome tokens for collateral after market resolution.
	 * @param conditionId - The resolved market condition
	 * @returns Transaction hash on success
	 */
	async redeem(conditionId: ConditionId): Promise<Result<string, TradingError>> {
		return this.writer.write("redeemPositions", [conditionId]);
	}
}
