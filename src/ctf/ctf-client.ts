/**
 * CtfClient — thin wrapper around ContractWriter for CTF operations.
 *
 * Delegates split, merge, and redeem calls to the underlying contract
 * writer with the correct function names and argument shapes.
 */

import type { ContractWriter } from "../lib/ethereum/contracts.js";
import type { Decimal } from "../shared/decimal.js";
import type { TradingError } from "../shared/errors.js";
import type { ConditionId } from "../shared/identifiers.js";
import type { Result } from "../shared/result.js";
import type { CtfConfig } from "./types.js";

export class CtfClient {
	private readonly config: CtfConfig;
	private readonly writer: ContractWriter;

	constructor(config: CtfConfig, writer: ContractWriter) {
		this.config = config;
		this.writer = writer;
	}

	async split(conditionId: ConditionId, amount: Decimal): Promise<Result<string, TradingError>> {
		return this.writer.write("splitPosition", [
			conditionId,
			this.config.collateralAddress,
			amount.toString(),
		]);
	}

	async merge(conditionId: ConditionId, amount: Decimal): Promise<Result<string, TradingError>> {
		return this.writer.write("mergePositions", [
			conditionId,
			this.config.collateralAddress,
			amount.toString(),
		]);
	}

	async redeem(conditionId: ConditionId): Promise<Result<string, TradingError>> {
		return this.writer.write("redeemPositions", [conditionId]);
	}
}
