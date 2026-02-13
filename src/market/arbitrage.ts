import { Decimal } from "../shared/decimal.js";
import { getEffectivePrices } from "./effective-prices.js";
import type { OrderbookSnapshot } from "./types.js";

export interface ArbitrageOpportunity {
	readonly type: "long" | "short";
	readonly grossProfit: Decimal;
	readonly netProfit: Decimal;
	readonly legs: ArbitrageLeg[];
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
				const legs: ArbitrageLeg[] = [
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
				const legs: ArbitrageLeg[] = [
					{ action: "sell", side: "yes", price: prices.sellYes },
					{ action: "sell", side: "no", price: prices.sellNo },
				];
				return { type: "short", grossProfit, netProfit, legs };
			}
		}
	}

	return null;
}
