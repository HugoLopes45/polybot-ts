export type { PricingInput, PricingResult } from "./types.js";
export {
	normalCdf,
	binaryCallPrice,
	binaryPutPrice,
	calcEdge,
	calcGammaFactor,
	calcExpectedValue,
	priceBinary,
} from "./black-scholes.js";

export type { EscapeRoute, EscapeVerdict } from "./dutch-book.js";
export { calculateEscapeRoute } from "./dutch-book.js";

export type { OracleConfig, OracleObservation, SettlementPrediction } from "./chainlink-tracker.js";
export { ChainlinkTracker } from "./chainlink-tracker.js";

export type {
	AggregatedPrice,
	OracleSourceConfig,
	PriceUpdate,
	WeightedOracleConfig,
} from "./weighted-oracle.js";
export { WeightedOracle } from "./weighted-oracle.js";

export type { RegressionStats } from "./online-regression.js";
export { OnlineRegression } from "./online-regression.js";

export type { TransferConfig, TransferPrediction } from "./logit-transfer.js";
export { LogitTransferModel } from "./logit-transfer.js";

export type { ImpactConfig, ImpactInput, ImpactEstimate } from "./impact-model.js";
export { estimateImpact, optimalSize } from "./impact-model.js";

export type { SpreadConfig, SpreadInput, SpreadResult } from "./dynamic-spread.js";
export { calcDynamicSpread } from "./dynamic-spread.js";

export type { ExpirySpreadConfig, ExpiryBucket } from "./expiry-spreader.js";
export { calcExpirySpread, defaultExpirySpreadConfig } from "./expiry-spreader.js";
