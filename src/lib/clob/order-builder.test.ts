/**
 * buildClobOrder — translates SdkOrderIntent to CLOB wire format.
 */

import { describe, expect, it } from "vitest";
import { Decimal } from "../../shared/decimal.js";
import { conditionId, marketTokenId } from "../../shared/identifiers.js";
import { MarketSide } from "../../shared/market-side.js";
import { OrderDirection } from "../../signal/types.js";
import type { SdkOrderIntent } from "../../signal/types.js";
import { buildClobOrder } from "./order-builder.js";

const BASE_INTENT: SdkOrderIntent = {
	conditionId: conditionId("cond-1"),
	tokenId: marketTokenId("tok-1"),
	side: MarketSide.Yes,
	direction: OrderDirection.Buy,
	price: Decimal.from("0.55"),
	size: Decimal.from("10"),
};

describe("buildClobOrder", () => {
	it("maps tokenId to string", () => {
		const req = buildClobOrder(BASE_INTENT);
		expect(req.tokenId).toBe("tok-1");
	});

	it("maps price to string", () => {
		const req = buildClobOrder(BASE_INTENT);
		expect(req.price).toBe("0.55");
	});

	it("maps size to string", () => {
		const req = buildClobOrder(BASE_INTENT);
		expect(req.size).toBe("10");
	});

	it("maps buy direction to BUY", () => {
		const req = buildClobOrder(BASE_INTENT);
		expect(req.side).toBe("BUY");
	});

	it("maps sell direction to SELL", () => {
		const intent: SdkOrderIntent = { ...BASE_INTENT, direction: OrderDirection.Sell };
		const req = buildClobOrder(intent);
		expect(req.side).toBe("SELL");
	});

	it("defaults orderType to GTC", () => {
		const req = buildClobOrder(BASE_INTENT);
		expect(req.orderType).toBe("GTC");
	});
});
