import { Decimal } from "../shared/decimal.js";
import { ErrorCategory, TradingError } from "../shared/errors.js";
import { type Result, err, ok } from "../shared/result.js";
import { getEffectivePrices } from "./effective-prices.js";
import type { ArbProfitBreakdown, OrderbookSnapshot } from "./types.js";

export interface ArbitrageOpportunity {
	readonly type: "long" | "short";
	readonly grossProfit: Decimal;
	readonly netProfit: Decimal;
	readonly legs: readonly ArbitrageLeg[];
}

export interface ArbitrageLeg {
	readonly action: "buy" | "sell";
	readonly side: "yes" | "no";
	readonly price: Decimal;
}

export function checkArbitrage(
	yesBook: OrderbookSnapshot,
	noBook: OrderbookSnapshot,
	feeRate: Decimal,
): ArbitrageOpportunity | null {
	const prices = getEffectivePrices(yesBook, noBook);

	if (prices.buyYes !== null && prices.buyNo !== null) {
		const totalCost = prices.buyYes.add(prices.buyNo);
		if (totalCost.lt(Decimal.one())) {
			const grossProfit = Decimal.one().sub(totalCost);
			const feeTotal = feeRate.mul(totalCost);
			const netProfit = grossProfit.sub(feeTotal);
			if (netProfit.isPositive()) {
				const legs: readonly ArbitrageLeg[] = [
					{ action: "buy", side: "yes", price: prices.buyYes },
					{ action: "buy", side: "no", price: prices.buyNo },
				];
				return { type: "long", grossProfit, netProfit, legs };
			}
		}
	}

	if (prices.sellYes !== null && prices.sellNo !== null) {
		const totalRevenue = prices.sellYes.add(prices.sellNo);
		if (totalRevenue.gt(Decimal.one())) {
			const grossProfit = totalRevenue.sub(Decimal.one());
			const feeTotal = feeRate.mul(totalRevenue);
			const netProfit = grossProfit.sub(feeTotal);
			if (netProfit.isPositive()) {
				const legs: readonly ArbitrageLeg[] = [
					{ action: "sell", side: "yes", price: prices.sellYes },
					{ action: "sell", side: "no", price: prices.sellNo },
				];
				return { type: "short", grossProfit, netProfit, legs };
			}
		}
	}

	return null;
}

const ZERO = Decimal.zero();
const ONE = Decimal.one();
const HUNDRED = Decimal.from(100);

export function calcArbProfit(
	yesPrice: Decimal,
	noPrice: Decimal,
	size: Decimal,
	feeRate: Decimal,
): Result<ArbProfitBreakdown, TradingError> {
	if (yesPrice.isNegative() || yesPrice.gt(ONE)) {
		return err(
			new TradingError("yesPrice must be in [0, 1]", "INVALID_PRICE", ErrorCategory.NonRetryable, {
				yesPrice: yesPrice.toString(),
			}),
		);
	}
	if (noPrice.isNegative() || noPrice.gt(ONE)) {
		return err(
			new TradingError("noPrice must be in [0, 1]", "INVALID_PRICE", ErrorCategory.NonRetryable, {
				noPrice: noPrice.toString(),
			}),
		);
	}
	if (size.isNegative()) {
		return err(
			new TradingError("size must be non-negative", "INVALID_SIZE", ErrorCategory.NonRetryable, {
				size: size.toString(),
			}),
		);
	}
	if (feeRate.isNegative()) {
		return err(
			new TradingError(
				"feeRate must be non-negative",
				"INVALID_FEE_RATE",
				ErrorCategory.NonRetryable,
				{ feeRate: feeRate.toString() },
			),
		);
	}

	const totalCostPerUnit = yesPrice.add(noPrice);
	const totalCost = totalCostPerUnit.mul(size);
	const gross = ONE.sub(yesPrice).sub(noPrice).mul(size);
	const totalFees = feeRate.mul(totalCost);
	const net = gross.sub(totalFees);
	const roiPct = totalCost.isZero() ? ZERO : net.div(totalCost).mul(HUNDRED);
	return ok({ gross, totalCost, totalFees, net, roiPct });
}

export function calcOptimalSize(
	opportunity: ArbitrageOpportunity,
	maxExposure: Decimal,
	availableBalance: Decimal,
): Result<Decimal, TradingError> {
	if (opportunity.legs.length === 0) {
		return err(
			new TradingError(
				"Opportunity must have at least one leg",
				"INVALID_OPPORTUNITY",
				ErrorCategory.NonRetryable,
			),
		);
	}
	if (maxExposure.isNegative()) {
		return err(
			new TradingError(
				"maxExposure must be non-negative",
				"INVALID_EXPOSURE",
				ErrorCategory.NonRetryable,
				{ maxExposure: maxExposure.toString() },
			),
		);
	}
	if (availableBalance.isNegative()) {
		return err(
			new TradingError(
				"availableBalance must be non-negative",
				"INVALID_BALANCE",
				ErrorCategory.NonRetryable,
				{ availableBalance: availableBalance.toString() },
			),
		);
	}

	const totalCostPerUnit = opportunity.legs.reduce((sum, leg) => sum.add(leg.price), ZERO);
	if (totalCostPerUnit.isZero()) return ok(ZERO);
	const maxFromBalance = availableBalance.div(totalCostPerUnit);
	return ok(Decimal.min(maxExposure, maxFromBalance));
}
