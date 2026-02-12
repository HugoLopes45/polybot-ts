import { Decimal } from "../shared/decimal.js";
import { bestAsk, bestBid, spread as calcSpread } from "./orderbook.js";
import type { MarketInfo, OrderbookSnapshot, ScanResult } from "./types.js";

export function scan(
	markets: readonly MarketInfo[],
	books: ReadonlyMap<string, OrderbookSnapshot>,
	oraclePrice?: ReadonlyMap<string, Decimal>,
): ScanResult[] {
	const results: ScanResult[] = [];

	for (const market of markets) {
		const key = market.conditionId as string;
		const book = books.get(key);
		if (!book) continue;

		const sp = calcSpread(book);
		if (sp === null) continue;

		const bid = bestBid(book);
		const ask = bestAsk(book);
		if (bid === null || ask === null) continue;

		const mid = bid.add(ask).div(Decimal.from(2));
		const oracle = oraclePrice?.get(key) ?? mid;
		const edge = oracle.sub(mid).abs();

		const spreadNum = sp.toNumber();
		const edgeNum = edge.toNumber();
		const score = spreadNum > 0 ? edgeNum / spreadNum : 0;

		results.push({
			conditionId: market.conditionId,
			edge,
			spread: sp,
			score,
		});
	}

	results.sort((a, b) => b.score - a.score);
	return results;
}
