/**
 * buildClobOrder — translates SdkOrderIntent to CLOB wire format.
 */

import type { SdkOrderIntent } from "../../signal/types.js";
import type { ClobOrderRequest } from "./types.js";

export function buildClobOrder(intent: SdkOrderIntent): ClobOrderRequest {
	return {
		tokenId: intent.tokenId as string,
		price: intent.price.toString(),
		size: intent.size.toString(),
		side: intent.direction === "buy" ? "BUY" : "SELL",
		orderType: "GTC",
	};
}
