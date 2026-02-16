import { Decimal } from "../shared/decimal.js";

export interface SpreadConfig {
	readonly baseSpreadBps: Decimal;
	readonly volMultiplier: Decimal;
	readonly minSpreadBps: Decimal;
	readonly maxSpreadBps: Decimal;
}

export interface SpreadInput {
	readonly volatility: Decimal;
	readonly timeRemainingMs: number;
	readonly inventorySkew?: Decimal;
}

export interface SpreadResult {
	readonly bidOffset: Decimal;
	readonly askOffset: Decimal;
	readonly halfSpreadBps: Decimal;
}

export function calcDynamicSpread(input: SpreadInput, config: SpreadConfig): SpreadResult {
	const volFactor = Decimal.one().add(config.volMultiplier.mul(input.volatility));
	let halfSpread = config.baseSpreadBps.mul(volFactor);

	let timeMultiplier = Decimal.one();
	if (input.timeRemainingMs < 60_000) {
		timeMultiplier = Decimal.from("2.0");
	} else if (input.timeRemainingMs < 180_000) {
		timeMultiplier = Decimal.from("1.5");
	}

	halfSpread = halfSpread.mul(timeMultiplier);

	halfSpread = clamp(halfSpread, config.minSpreadBps, config.maxSpreadBps);

	const skew = input.inventorySkew ?? Decimal.zero();
	const skewFactor = Decimal.from("0.5");

	const bidFactor = Decimal.one().add(skew.mul(skewFactor));
	const askFactor = Decimal.one().sub(skew.mul(skewFactor));

	let bidOffset = halfSpread.mul(bidFactor);
	let askOffset = halfSpread.mul(askFactor);

	bidOffset = clamp(bidOffset, config.minSpreadBps, config.maxSpreadBps);
	askOffset = clamp(askOffset, config.minSpreadBps, config.maxSpreadBps);

	return {
		bidOffset,
		askOffset,
		halfSpreadBps: halfSpread,
	};
}

function clamp(value: Decimal, min: Decimal, max: Decimal): Decimal {
	if (value.lt(min)) return min;
	if (value.gt(max)) return max;
	return value;
}
