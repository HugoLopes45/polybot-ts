import type { Executor } from "../execution/types.js";
import type { OrderResult } from "../order/types.js";
import { Decimal } from "../shared/decimal.js";
import { ErrorCategory, TradingError } from "../shared/errors.js";
import { idToString, marketTokenId } from "../shared/identifiers.js";
import type { ConditionId } from "../shared/identifiers.js";
import { type Result, err, isErr, ok } from "../shared/result.js";
import type { SdkOrderIntent } from "../signal/types.js";
import { OrderDirection } from "../signal/types.js";
import type { ArbitrageLeg, ArbitrageOpportunity } from "./arbitrage.js";
import { calcOptimalSize } from "./arbitrage.js";

export interface ArbitrageExecutorConfig {
	readonly feeRate: Decimal;
	readonly sizeSafetyFactor: Decimal;
	readonly minNetProfit: Decimal;
	readonly maxExposure: Decimal;
	readonly availableBalance: Decimal;
}

export interface ArbitrageExecutionResult {
	readonly opportunity: ArbitrageOpportunity;
	readonly size: Decimal;
	readonly orders: readonly SdkOrderIntent[];
	readonly results: readonly OrderResult[];
}

export class ArbitrageExecutor {
	private readonly executor: Executor;
	private readonly config: ArbitrageExecutorConfig;

	private constructor(executor: Executor, config: ArbitrageExecutorConfig) {
		this.executor = executor;
		this.config = config;
	}

	static create(
		executor: Executor,
		config: ArbitrageExecutorConfig,
	): Result<ArbitrageExecutor, TradingError> {
		if (config.feeRate.isNegative() || config.feeRate.gt(Decimal.one())) {
			return err(
				new TradingError(
					"feeRate must be in [0, 1]",
					"INVALID_CONFIG",
					ErrorCategory.NonRetryable,
					{ feeRate: config.feeRate.toString() },
				),
			);
		}

		if (config.sizeSafetyFactor.lte(Decimal.zero()) || config.sizeSafetyFactor.gt(Decimal.one())) {
			return err(
				new TradingError(
					"sizeSafetyFactor must be in (0, 1]",
					"INVALID_CONFIG",
					ErrorCategory.NonRetryable,
					{ sizeSafetyFactor: config.sizeSafetyFactor.toString() },
				),
			);
		}

		if (config.minNetProfit.isNegative()) {
			return err(
				new TradingError(
					"minNetProfit must be non-negative",
					"INVALID_CONFIG",
					ErrorCategory.NonRetryable,
					{ minNetProfit: config.minNetProfit.toString() },
				),
			);
		}

		if (config.maxExposure.lte(Decimal.zero())) {
			return err(
				new TradingError(
					"maxExposure must be positive",
					"INVALID_CONFIG",
					ErrorCategory.NonRetryable,
					{ maxExposure: config.maxExposure.toString() },
				),
			);
		}

		return ok(new ArbitrageExecutor(executor, config));
	}

	async execute(
		opportunity: ArbitrageOpportunity,
		conditionIdValue: ConditionId,
	): Promise<Result<ArbitrageExecutionResult, TradingError>> {
		const validation = this.validateOpportunity(opportunity);
		if (isErr(validation)) {
			return err(validation.error);
		}

		const sizeResult = calcOptimalSize(
			opportunity,
			this.config.maxExposure.mul(this.config.sizeSafetyFactor),
			this.config.availableBalance,
		);
		if (isErr(sizeResult)) {
			return err(sizeResult.error);
		}

		const size = sizeResult.value;
		if (size.isZero()) {
			return err(
				new TradingError(
					"No size available for arbitrage",
					"INSUFFICIENT_LIQUIDITY",
					ErrorCategory.NonRetryable,
				),
			);
		}

		const orders: SdkOrderIntent[] = [];
		const results: OrderResult[] = [];

		for (const leg of opportunity.legs) {
			const orderResult = this.createOrder(leg, size, conditionIdValue);
			if (isErr(orderResult)) {
				return this.rollbackAndFail(results, opportunity, orderResult.error);
			}

			const order = orderResult.value;
			orders.push(order);

			const submitResult = await this.executor.submit(order);
			if (isErr(submitResult)) {
				return this.rollbackAndFail(results, opportunity, submitResult.error);
			}

			results.push(submitResult.value);
		}

		return ok({ opportunity, size, orders, results });
	}

	private async rollbackAndFail(
		results: readonly OrderResult[],
		opportunity: ArbitrageOpportunity,
		originalError: TradingError,
	): Promise<Result<never, TradingError>> {
		const cancelOutcomes: string[] = [];
		for (const successResult of results) {
			const cancelResult = await this.executor.cancel(successResult.clientOrderId);
			cancelOutcomes.push(
				cancelResult.ok
					? `${successResult.clientOrderId}: cancelled`
					: `${successResult.clientOrderId}: cancel_failed`,
			);
		}
		return err(
			new TradingError(
				`Partial execution: ${results.length}/${opportunity.legs.length} legs submitted, rollback attempted`,
				originalError.code,
				originalError.category,
				{
					partialResults: results.length,
					totalLegs: opportunity.legs.length,
					originalError: originalError.message,
					cancelOutcomes,
					cause: originalError,
				},
			),
		);
	}

	private validateOpportunity(opportunity: ArbitrageOpportunity): Result<void, TradingError> {
		if (opportunity.netProfit.lt(this.config.minNetProfit)) {
			return err(
				new TradingError(
					`Net profit ${opportunity.netProfit.toString()} below minimum ${this.config.minNetProfit.toString()}`,
					"INSUFFICIENT_PROFIT",
					ErrorCategory.NonRetryable,
					{
						netProfit: opportunity.netProfit.toString(),
						minNetProfit: this.config.minNetProfit.toString(),
					},
				),
			);
		}
		return ok(undefined);
	}

	private createOrder(
		leg: ArbitrageLeg,
		size: Decimal,
		conditionIdValue: ConditionId,
	): Result<SdkOrderIntent, TradingError> {
		if (!size.isPositive()) {
			return err(
				new TradingError(
					"Order size must be positive",
					"INVALID_SIZE",
					ErrorCategory.NonRetryable,
					{ size: size.toString() },
				),
			);
		}

		if (!leg.price.isPositive()) {
			return err(
				new TradingError(
					"Order price must be positive",
					"INVALID_PRICE",
					ErrorCategory.NonRetryable,
					{ price: leg.price.toString() },
				),
			);
		}

		const tokenId = marketTokenId(`${idToString(conditionIdValue)}-${leg.side}`);
		return ok({
			conditionId: conditionIdValue,
			tokenId,
			side: leg.side,
			direction: leg.action === "buy" ? OrderDirection.Buy : OrderDirection.Sell,
			price: leg.price,
			size,
		});
	}
}
