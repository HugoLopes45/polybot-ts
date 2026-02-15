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

/** Persistence interface for recording strategy decisions and events. */
export interface Journal {
	record(event: JournalEntry): Promise<void>;
	flush(): Promise<void>;
}

/** Discriminated union of all recordable strategy events (signals, orders, positions, guards, errors). */
export type JournalEntry =
	| {
			readonly type: "entry_signal";
			readonly signal: unknown;
			readonly intent: SdkOrderIntent;
			readonly timestamp: number;
	  }
	| {
			readonly type: "exit_signal";
			readonly conditionId: ConditionId;
			readonly reason: ExitReason;
			readonly timestamp: number;
	  }
	| {
			readonly type: "order_submitted";
			readonly intent: SdkOrderIntent;
			readonly clientOrderId: ClientOrderId;
			readonly timestamp: number;
	  }
	| {
			readonly type: "order_filled";
			readonly clientOrderId: ClientOrderId;
			readonly fillPrice: number;
			readonly size: number;
			readonly fee: number;
			readonly timestamp: number;
	  }
	| {
			readonly type: "position_opened";
			readonly conditionId: ConditionId;
			readonly tokenId: MarketTokenId;
			readonly side: MarketSide;
			readonly entryPrice: number;
			readonly size: number;
			readonly timestamp: number;
	  }
	| {
			readonly type: "position_closed";
			readonly conditionId: ConditionId;
			readonly entryPrice: number;
			readonly exitPrice: number;
			readonly pnl: number;
			readonly reason: ExitReasonType;
			readonly fee?: number;
			readonly timestamp: number;
	  }
	| {
			readonly type: "guard_blocked";
			readonly guardName: string;
			readonly reason: string;
			readonly timestamp: number;
	  }
	| {
			readonly type: "error";
			readonly code: string;
			readonly message: string;
			readonly timestamp: number;
	  };
