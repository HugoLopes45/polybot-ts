import type { Decimal } from "../shared/decimal.js";
import type { ConditionId, MarketTokenId } from "../shared/identifiers.js";
import type { MarketSide } from "../shared/market-side.js";
import type { SdkPosition } from "./sdk-position.js";

const DEFAULT_HALT_THRESHOLD = 3;

export interface ExchangePosition {
	readonly conditionId: ConditionId;
	readonly tokenId: MarketTokenId;
	readonly side: MarketSide;
	readonly size: Decimal;
}

export type ReconcileAction =
	| { readonly type: "orphan"; readonly conditionId: ConditionId; readonly sdkSize: Decimal }
	| { readonly type: "unknown"; readonly position: ExchangePosition }
	| {
			readonly type: "size_mismatch";
			readonly conditionId: ConditionId;
			readonly sdkSize: Decimal;
			readonly exchangeSize: Decimal;
	  };

export interface ReconcileResult {
	readonly actions: readonly ReconcileAction[];
	readonly shouldHalt: boolean;
	readonly summary: string;
}

export interface ReconcilerConfig {
	readonly haltThreshold: number;
}

function positionKey(conditionId: string, side: MarketSide): string {
	return `${conditionId}:${side}`;
}

export class PositionReconciler {
	readonly config: ReconcilerConfig;

	constructor(config: Partial<ReconcilerConfig> = {}) {
		this.config = {
			haltThreshold: config.haltThreshold ?? DEFAULT_HALT_THRESHOLD,
		};
	}

	reconcile(
		sdkPositions: readonly SdkPosition[],
		exchangePositions: readonly ExchangePosition[],
	): ReconcileResult {
		const actions: ReconcileAction[] = [];

		const sdkMap = new Map<string, SdkPosition>();
		for (const pos of sdkPositions) {
			sdkMap.set(positionKey(pos.conditionId as string, pos.side), pos);
		}

		const exchangeMap = new Map<string, ExchangePosition>();
		for (const pos of exchangePositions) {
			exchangeMap.set(positionKey(pos.conditionId as string, pos.side), pos);
		}

		for (const [key, sdkPos] of sdkMap) {
			const exchangePos = exchangeMap.get(key);
			if (!exchangePos) {
				actions.push({
					type: "orphan",
					conditionId: sdkPos.conditionId,
					sdkSize: sdkPos.size,
				});
			} else if (!sdkPos.size.eq(exchangePos.size)) {
				actions.push({
					type: "size_mismatch",
					conditionId: sdkPos.conditionId,
					sdkSize: sdkPos.size,
					exchangeSize: exchangePos.size,
				});
			}
		}

		for (const [key, exchangePos] of exchangeMap) {
			if (!sdkMap.has(key)) {
				actions.push({
					type: "unknown",
					position: exchangePos,
				});
			}
		}

		const orphanCount = actions.filter((a) => a.type === "orphan").length;
		const unknownCount = actions.filter((a) => a.type === "unknown").length;
		const mismatchCount = actions.filter((a) => a.type === "size_mismatch").length;

		const shouldHalt = unknownCount > this.config.haltThreshold;

		const summary = shouldHalt
			? `HALTED: Too many unknowns (${unknownCount})`
			: `Sync: ${orphanCount} orphans, ${unknownCount} unknowns, ${mismatchCount} mismatches`;

		return {
			actions,
			shouldHalt,
			summary,
		};
	}
}
