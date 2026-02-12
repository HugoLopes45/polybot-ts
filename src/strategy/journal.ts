/**
 * Journal — optional persistence layer for strategy decisions.
 *
 * Records trading decisions for later analysis, replay, or audit.
 * Uses branded ConditionId/MarketTokenId for identifiers but plain
 * numbers for prices/sizes (standard serialization boundary practice).
 */

import type { ClientOrderId, ConditionId, MarketTokenId } from "../shared/identifiers.js";
import type { MarketSide } from "../shared/market-side.js";
import type { ExitReason, ExitReasonType, SdkOrderIntent } from "../signal/types.js";

export interface Journal {
	record(event: JournalEntry): Promise<void>;
}

export type JournalEntry =
	| { type: "entry_signal"; signal: unknown; intent: SdkOrderIntent; timestamp: number }
	| { type: "exit_signal"; conditionId: ConditionId; reason: ExitReason; timestamp: number }
	| {
			type: "order_submitted";
			intent: SdkOrderIntent;
			clientOrderId: ClientOrderId;
			timestamp: number;
	  }
	| {
			type: "order_filled";
			clientOrderId: ClientOrderId;
			fillPrice: number;
			size: number;
			fee: number;
			timestamp: number;
	  }
	| {
			type: "position_opened";
			conditionId: ConditionId;
			tokenId: MarketTokenId;
			side: MarketSide;
			entryPrice: number;
			size: number;
			timestamp: number;
	  }
	| {
			type: "position_closed";
			conditionId: ConditionId;
			entryPrice: number;
			exitPrice: number;
			pnl: number;
			reason: ExitReasonType;
			fee?: number;
			timestamp: number;
	  }
	| { type: "guard_blocked"; guardName: string; reason: string; timestamp: number }
	| { type: "error"; code: string; message: string; timestamp: number };
