import type { EventDispatcher } from "../events/event-dispatcher.js";
import type { PositionClosed, SdkEvent } from "../events/sdk-events.js";
import { Decimal } from "../shared/decimal.js";

export interface StatsSnapshot {
	readonly tradeCount: number;
	readonly winCount: number;
	readonly lossCount: number;
	readonly winRate: number;
	readonly avgPnl: Decimal;
	readonly totalPnl: Decimal;
	readonly maxDrawdown: Decimal;
	readonly totalFees: Decimal;
	readonly bestTrade: Decimal;
	readonly worstTrade: Decimal;
}

export class StrategyStats {
	private tradeCount = 0;
	private winCount = 0;
	private lossCount = 0;
	private totalPnl = Decimal.zero();
	private totalFees = Decimal.zero();
	private peakEquity = Decimal.zero();
	private maxDrawdown = Decimal.zero();
	private bestTrade = Decimal.zero();
	private worstTrade = Decimal.zero();

	constructor(eventDispatcher: EventDispatcher) {
		eventDispatcher.onSdk("position_closed", (event: SdkEvent) => {
			if (event.type === "position_closed") {
				this.handlePositionClosed(event);
			}
		});
	}

	private handlePositionClosed(event: PositionClosed): void {
		if (typeof event.pnl !== "number" || !Number.isFinite(event.pnl)) {
			return;
		}
		if (event.fee !== undefined && (typeof event.fee !== "number" || !Number.isFinite(event.fee))) {
			return;
		}

		const pnl = Decimal.from(event.pnl);
		const rawFee = event.fee !== undefined ? Decimal.from(event.fee) : Decimal.zero();
		const fee = rawFee.isNegative() ? Decimal.zero() : rawFee;

		this.tradeCount++;

		this.totalPnl = this.totalPnl.add(pnl);
		this.totalFees = this.totalFees.add(fee);

		if (pnl.gt(Decimal.zero())) {
			this.winCount++;
		} else if (pnl.lt(Decimal.zero())) {
			this.lossCount++;
		}

		const netEquity = this.totalPnl.sub(this.totalFees);
		if (netEquity.gt(this.peakEquity)) {
			this.peakEquity = netEquity;
		} else {
			const currentDrawdown = this.peakEquity.sub(netEquity);
			if (currentDrawdown.gt(this.maxDrawdown)) {
				this.maxDrawdown = currentDrawdown;
			}
		}

		if (this.tradeCount === 1) {
			this.bestTrade = pnl;
			this.worstTrade = pnl;
		} else {
			if (pnl.gt(this.bestTrade)) {
				this.bestTrade = pnl;
			}
			if (pnl.lt(this.worstTrade)) {
				this.worstTrade = pnl;
			}
		}
	}

	snapshot(): StatsSnapshot {
		const winRate = this.tradeCount > 0 ? this.winCount / this.tradeCount : 0;
		const avgPnl =
			this.tradeCount > 0 ? this.totalPnl.div(Decimal.from(this.tradeCount)) : Decimal.zero();

		return {
			tradeCount: this.tradeCount,
			winCount: this.winCount,
			lossCount: this.lossCount,
			winRate,
			avgPnl,
			totalPnl: this.totalPnl,
			maxDrawdown: this.maxDrawdown,
			totalFees: this.totalFees,
			bestTrade: this.bestTrade,
			worstTrade: this.worstTrade,
		};
	}
}
