/**
 * Contract interaction interfaces — generic read/write helpers for
 * smart contract operations.
 *
 * These are abstractions only. Concrete implementations will use
 * viem's readContract/writeContract when CTF support is added.
 */

import type { TradingError } from "../../shared/errors.js";
import type { Result } from "../../shared/result.js";

export interface ContractReader {
	read<T>(functionName: string, args?: readonly unknown[]): Promise<Result<T, TradingError>>;
}

export interface ContractWriter {
	write(functionName: string, args?: readonly unknown[]): Promise<Result<string, TradingError>>;
}
