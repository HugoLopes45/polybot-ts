import { fixedNotionalFee } from "../accounting/fee-model.js";
import { GuardPipeline } from "../risk/guard-pipeline.js";
import { ExitPipeline } from "../signal/exit-pipeline.js";
import { StrategyBuilder } from "./strategy-builder.js";

/**
 * Conservative preset: tight guards, low risk, small profit targets.
 * Best for cautious traders or volatile markets.
 */
export function conservative(): StrategyBuilder {
	return StrategyBuilder.create()
		.withFeeModel(fixedNotionalFee(10))
		.withGuards(GuardPipeline.conservative())
		.withExits(ExitPipeline.conservative());
}

/**
 * Aggressive preset: relaxed guards, high position limit, wide stops.
 * Best for confident traders with high risk tolerance.
 */
export function aggressive(): StrategyBuilder {
	return StrategyBuilder.create()
		.withFeeModel(fixedNotionalFee(25))
		.withGuards(GuardPipeline.aggressive())
		.withExits(ExitPipeline.aggressive());
}

/**
 * Scalper preset: tight spreads, fast ticks, IOC orders, tight stops.
 * Best for high-frequency small-profit trades.
 * Uses conservative guards for quick entries and tight stop-loss.
 */
export function scalper(): StrategyBuilder {
	return StrategyBuilder.create()
		.withFeeModel(fixedNotionalFee(5))
		.withGuards(GuardPipeline.conservative())
		.withExits(ExitPipeline.conservative());
}

/**
 * Long-term preset: wider stops, time-based exits, lower fees.
 * Best for swing trades and position trading.
 * Uses conservative guards with wide stop-loss and long time exits.
 */
export function longTerm(): StrategyBuilder {
	return StrategyBuilder.create()
		.withFeeModel(fixedNotionalFee(20))
		.withGuards(GuardPipeline.conservative())
		.withExits(ExitPipeline.conservative());
}

/**
 * EV Hunter preset: edge-focused, wider stops, moderate guards.
 * Best for expected-value-driven strategies.
 */
export function evHunter(): StrategyBuilder {
	return StrategyBuilder.create()
		.withFeeModel(fixedNotionalFee(15))
		.withGuards(GuardPipeline.standard())
		.withExits(ExitPipeline.standard());
}
