import type { Decimal } from "../shared/decimal.js";
import type { MarketSide } from "../shared/market-side.js";

/** A single tick in the replay feed. */
export interface ReplayTick {
	readonly timestampMs: number;
	readonly bid: Decimal;
	readonly ask: Decimal;
	readonly side: MarketSide;
}

/** Configuration for market replay generators. */
export interface GeneratorConfig {
	readonly startMs: number;
	readonly tickIntervalMs: number;
	readonly numTicks: number;
	readonly side: MarketSide;
}
