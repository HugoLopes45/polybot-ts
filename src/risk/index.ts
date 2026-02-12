/**
 * Risk management module providing pre-trade guard evaluation.
 *
 * Core exports:
 * - {@link GuardPipeline} — composable guard execution pipeline
 * - {@link GuardContext} — slim interface for guard checks
 * - {@link GuardVerdict} — allow/block results with diagnostics
 * - Verdict helpers: {@link allow}, {@link block}, {@link blockFatal}
 *
 * Guard implementations:
 * - Position guards: MaxPositionsGuard, ExposureGuard, PerMarketLimitGuard
 * - Price guards: MaxSpreadGuard, MinEdgeGuard, BookStalenessGuard
 * - Rate guards: CooldownGuard, RateLimitGuard, DuplicateOrderGuard
 * - Risk guards: ToxicityGuard, PortfolioRiskGuard, CircuitBreakerGuard
 * - Safety guards: KillSwitchGuard, BalanceGuard, UsdcRejectionGuard
 *
 * @module
 */
export type { EntryGuard, GuardContext, GuardVerdict } from "./types.js";
export {
	allow,
	block,
	blockFatal,
	blockFatalWithValues,
	blockWithValues,
	isAllowed,
	isBlocked,
} from "./types.js";

export { GuardPipeline } from "./guard-pipeline.js";

export { BalanceGuard } from "./guards/balance.js";
export { BookStalenessGuard } from "./guards/book-staleness.js";
export { CircuitBreakerGuard } from "./guards/circuit-breaker.js";
export { CooldownGuard } from "./guards/cooldown.js";
export { DuplicateOrderGuard } from "./guards/duplicate-order.js";
export { ExposureGuard } from "./guards/exposure.js";
export { KillSwitchGuard, KillSwitchMode } from "./guards/kill-switch.js";
export { MaxPositionsGuard } from "./guards/max-positions.js";
export { MaxSpreadGuard } from "./guards/max-spread.js";
export { MinEdgeGuard } from "./guards/min-edge.js";
export { PerMarketLimitGuard } from "./guards/per-market-limit.js";
export { PortfolioRiskGuard } from "./guards/portfolio-risk.js";
export { RateLimitGuard } from "./guards/rate-limit.js";
export { ToxicityGuard } from "./guards/toxicity.js";
export { UsdcRejectionGuard } from "./guards/usdc-rejection.js";
