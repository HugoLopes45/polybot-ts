export type { ReplayTick, GeneratorConfig } from "./types.js";
export { priceTrend, randomWalk, meanReverting, expiryCountdown } from "./generators.js";
export {
	calcSharpe,
	calcProfitFactor,
	calcMaxDrawdown,
	calcCalmarRatio,
	calcWinRate,
} from "./metrics.js";
export type { SlippageModel } from "./slippage-model.js";
export {
	FixedBpsSlippage,
	SizeProportionalSlippage,
	CommissionModel,
} from "./slippage-model.js";
export type {
	BacktestConfig,
	BacktestResult,
	TradeRecord,
	BacktestDetector,
	EntryState,
} from "./engine.js";
export { runBacktest } from "./engine.js";
