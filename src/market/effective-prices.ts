import { Decimal } from "../shared/decimal.js";
import { bestAsk, bestBid } from "./orderbook.js";
import type { OrderbookSnapshot } from "./types.js";

export interface EffectivePrices {
	readonly buyYes: Decimal | null;
	readonly buyNo: Decimal | null;
	readonly sellYes: Decimal | null;
	readonly sellNo: Decimal | null;
}

export function getEffectivePrices(
	yesBook: OrderbookSnapshot,
	noBook: OrderbookSnapshot,
): EffectivePrices {
	const yesAsk = bestAsk(yesBook);
	const yesBid = bestBid(yesBook);
	const noAsk = bestAsk(noBook);
	const noBid = bestBid(noBook);

	const buyYes = computeBuyYes(yesAsk, noBid);
	const buyNo = computeBuyNo(noAsk, yesBid);
	const sellYes = computeSellYes(yesBid, noAsk);
	const sellNo = computeSellNo(noBid, yesAsk);

	return { buyYes, buyNo, sellYes, sellNo };
}

function computeBuyYes(yesAsk: Decimal | null, noBid: Decimal | null): Decimal | null {
	if (yesAsk === null && noBid === null) return null;

	const direct = yesAsk !== null ? yesAsk : null;
	const mirror = noBid !== null ? Decimal.one().sub(noBid) : null;

	if (direct !== null && mirror !== null) return Decimal.min(direct, mirror);
	if (direct !== null) return direct;
	return mirror;
}

function computeBuyNo(noAsk: Decimal | null, yesBid: Decimal | null): Decimal | null {
	if (noAsk === null && yesBid === null) return null;

	const direct = noAsk !== null ? noAsk : null;
	const mirror = yesBid !== null ? Decimal.one().sub(yesBid) : null;

	if (direct !== null && mirror !== null) return Decimal.min(direct, mirror);
	if (direct !== null) return direct;
	return mirror;
}

function computeSellYes(yesBid: Decimal | null, noAsk: Decimal | null): Decimal | null {
	if (yesBid === null && noAsk === null) return null;

	const direct = yesBid !== null ? yesBid : null;
	const mirror = noAsk !== null ? Decimal.one().sub(noAsk) : null;

	if (direct !== null && mirror !== null) return Decimal.max(direct, mirror);
	if (direct !== null) return direct;
	return mirror;
}

function computeSellNo(noBid: Decimal | null, yesAsk: Decimal | null): Decimal | null {
	if (noBid === null && yesAsk === null) return null;

	const direct = noBid !== null ? noBid : null;
	const mirror = yesAsk !== null ? Decimal.one().sub(yesAsk) : null;

	if (direct !== null && mirror !== null) return Decimal.max(direct, mirror);
	if (direct !== null) return direct;
	return mirror;
}
