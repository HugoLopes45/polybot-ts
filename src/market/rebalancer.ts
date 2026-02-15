import { Decimal } from "../shared/decimal.js";
import { ErrorCategory, TradingError } from "../shared/errors.js";
import type { MarketTokenId } from "../shared/identifiers.js";
import { type Result, err, ok } from "../shared/result.js";

export interface RebalancerConfig {
	readonly targetUsdcRatio: Decimal;
	readonly tolerance: Decimal;
	readonly minRebalanceUsdc: Decimal;
}

export interface TokenBalance {
	readonly tokenId: MarketTokenId;
	readonly balance: Decimal;
	readonly usdcValue: Decimal;
}

export interface RebalanceAction {
	readonly tokenId: MarketTokenId;
	readonly action: "buy" | "sell";
	readonly amount: Decimal;
	readonly currentRatio: Decimal;
	readonly targetRatio: Decimal;
}

export class Rebalancer {
	private readonly config: RebalancerConfig;

	private constructor(config: RebalancerConfig) {
		this.config = config;
	}

	static create(config: RebalancerConfig): Result<Rebalancer, TradingError> {
		if (config.targetUsdcRatio.isNegative() || config.targetUsdcRatio.gt(Decimal.one())) {
			return err(
				new TradingError(
					"targetUsdcRatio must be in [0, 1]",
					"INVALID_CONFIG",
					ErrorCategory.NonRetryable,
					{ targetUsdcRatio: config.targetUsdcRatio.toString() },
				),
			);
		}

		if (config.tolerance.isNegative()) {
			return err(
				new TradingError(
					"tolerance must be non-negative",
					"INVALID_CONFIG",
					ErrorCategory.NonRetryable,
					{ tolerance: config.tolerance.toString() },
				),
			);
		}

		if (config.minRebalanceUsdc.isNegative()) {
			return err(
				new TradingError(
					"minRebalanceUsdc must be non-negative",
					"INVALID_CONFIG",
					ErrorCategory.NonRetryable,
					{ minRebalanceUsdc: config.minRebalanceUsdc.toString() },
				),
			);
		}

		return ok(new Rebalancer(config));
	}

	calculateRebalance(
		balances: readonly TokenBalance[],
		totalUsdc: Decimal,
	): Result<readonly RebalanceAction[], TradingError> {
		const totalValue = totalPortfolioValue(balances, totalUsdc);
		if (totalValue.isZero()) {
			return ok([]);
		}

		const tokenCount = balances.length;
		const targetTokenRatio =
			tokenCount > 0
				? Decimal.one().sub(this.config.targetUsdcRatio).div(Decimal.from(tokenCount))
				: Decimal.zero();
		const actions: RebalanceAction[] = [];

		for (const balance of balances) {
			const currentRatio = balance.usdcValue.div(totalValue);
			const diff = targetTokenRatio.sub(currentRatio).abs();

			if (diff.lt(this.config.tolerance)) {
				continue;
			}

			const imbalance = diff.mul(totalValue);
			if (imbalance.lt(this.config.minRebalanceUsdc)) {
				continue;
			}

			actions.push({
				tokenId: balance.tokenId,
				action: currentRatio.gt(targetTokenRatio) ? "sell" : "buy",
				amount: imbalance,
				currentRatio,
				targetRatio: targetTokenRatio,
			});
		}

		return ok(actions);
	}

	getPortfolioRatio(balances: readonly TokenBalance[], totalUsdc: Decimal): Decimal {
		const totalValue = totalPortfolioValue(balances, totalUsdc);
		if (totalValue.isZero()) {
			return Decimal.zero();
		}
		return totalUsdc.div(totalValue);
	}
}

function totalPortfolioValue(balances: readonly TokenBalance[], totalUsdc: Decimal): Decimal {
	const totalTokenValue = balances.reduce((sum, b) => sum.add(b.usdcValue), Decimal.zero());
	return totalUsdc.add(totalTokenValue);
}
