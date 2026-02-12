import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { conditionId, marketTokenId } from "../shared/identifiers.js";
import { MarketSide } from "../shared/market-side.js";
import { OrderDirection } from "../signal/types.js";
import { buyNo, buyYes, sellNo, sellYes } from "./order-intent.js";

const d = Decimal.from;
const CID = conditionId("cond-1");
const YES_TID = marketTokenId("yes-tok");
const NO_TID = marketTokenId("no-tok");

describe("OrderIntent factories", () => {
	it("buyYes creates correct intent", () => {
		const intent = buyYes(CID, YES_TID, d("0.55"), d("100"));
		expect(intent.conditionId).toBe(CID);
		expect(intent.tokenId).toBe(YES_TID);
		expect(intent.side).toBe(MarketSide.Yes);
		expect(intent.direction).toBe(OrderDirection.Buy);
		expect(intent.price.eq(d("0.55"))).toBe(true);
		expect(intent.size.eq(d("100"))).toBe(true);
	});

	it("buyNo creates correct intent", () => {
		const intent = buyNo(CID, NO_TID, d("0.40"), d("200"));
		expect(intent.side).toBe(MarketSide.No);
		expect(intent.direction).toBe(OrderDirection.Buy);
	});

	it("sellYes creates correct intent", () => {
		const intent = sellYes(CID, YES_TID, d("0.60"), d("50"));
		expect(intent.side).toBe(MarketSide.Yes);
		expect(intent.direction).toBe(OrderDirection.Sell);
		expect(intent.size.eq(d("50"))).toBe(true);
	});

	it("sellNo creates correct intent", () => {
		const intent = sellNo(CID, NO_TID, d("0.45"), d("75"));
		expect(intent.side).toBe(MarketSide.No);
		expect(intent.direction).toBe(OrderDirection.Sell);
		expect(intent.price.eq(d("0.45"))).toBe(true);
	});

	it("intent objects are frozen (immutable)", () => {
		const intent = buyYes(CID, YES_TID, d("0.55"), d("100"));
		expect(Object.isFrozen(intent)).toBe(true);
	});

	it("rejects negative price", () => {
		expect(() => buyYes(CID, YES_TID, d("-0.01"), d("100"))).toThrow();
	});

	it("rejects zero size", () => {
		expect(() => buyYes(CID, YES_TID, d("0.55"), d("0"))).toThrow();
	});

	it("rejects negative size", () => {
		expect(() => buyYes(CID, YES_TID, d("0.55"), d("-10"))).toThrow();
	});
});
