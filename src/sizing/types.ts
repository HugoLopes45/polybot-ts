/**
 * Position sizing types and interfaces.
 *
 * Provides abstractions for position sizing strategies (Fixed, Kelly).
 */

import type { Decimal } from "../shared/decimal.js";

export interface SizingInput {
	readonly balance: Decimal;
	readonly edge: Decimal; // (fairPrice - marketPrice) / marketPrice
	readonly marketPrice: Decimal; // Current market price
	readonly maxPositionPct?: Decimal; // Max % of balance per position (default 0.25)
}

export type SizingMethod = "fixed" | "kelly" | "half_kelly" | "quarter_kelly" | "custom_kelly";

export interface SizingResult {
	readonly size: Decimal; // Recommended position size in tokens
	readonly fraction: Decimal; // Fraction of balance to risk
	readonly method: SizingMethod;
}

export interface PositionSizer {
	readonly name: string;
	size(input: SizingInput): SizingResult;
}
