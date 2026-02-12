import type { SdkOrderIntent } from "../../signal/types.js";
import type { ClobOrderRequest } from "./types.js";

/**
 * Translates a domain order intent to CLOB wire format.
 * @param intent - The SDK order intent with token, price, size, and direction
 * @returns CLOB order request ready for submission
 * @example
 * ```ts
 * const intent = buyYes(conditionId("0xabc"), marketTokenId("123456"), Decimal.from(0.55), Decimal.from(10));
 * const order = buildClobOrder(intent);
 * // { tokenId: "123456", price: "0.55", size: "10", side: "BUY", orderType: "GTC" }
 * ```
 */
export function buildClobOrder(intent: SdkOrderIntent): ClobOrderRequest {
	return {
		tokenId: intent.tokenId as string,
		price: intent.price.toString(),
		size: intent.size.toString(),
		side: intent.direction === "buy" ? "BUY" : "SELL",
		orderType: "GTC",
	};
}
