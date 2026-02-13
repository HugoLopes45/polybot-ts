/**
 * DetectorContext — facade implementing all 5 ISP sub-views.
 *
 * Single entry point for strategies to access market data, positions,
 * oracle, state, and risk information.
 */

import { StrategyState } from "../lifecycle/types.js";
import type { SdkPosition } from "../position/sdk-position.js";
import { Decimal } from "../shared/decimal.js";
import type { ConditionId } from "../shared/identifiers.js";
import type { MarketSide } from "../shared/market-side.js";
import { type Clock, SystemClock } from "../shared/time.js";
import type { MarketView, OracleView, PositionView, RiskView, StateView } from "./types.js";

interface BookSide {
	readonly bid: Decimal | null;
	readonly ask: Decimal | null;
}

interface DetectorContextParams {
	readonly conditionId: ConditionId;
	readonly clock?: Clock | undefined;
	readonly book?: Readonly<Record<MarketSide, BookSide>> | undefined;
	readonly bestBid?: Decimal | null | undefined;
	readonly bestAsk?: Decimal | null | undefined;
	readonly oraclePrice: Decimal | null;
	readonly oracleAgeMs: number | null;
	readonly timeRemainingMs: number;
	readonly positions: readonly SdkPosition[];
	readonly state: StrategyState;
	readonly dailyPnl: Decimal;
	readonly consecutiveLosses: number;
	readonly availableBalance: Decimal;
}

export class DetectorContext implements MarketView, PositionView, OracleView, StateView, RiskView {
	private readonly params: DetectorContextParams;

	private constructor(params: DetectorContextParams) {
		this.params = params;
	}

	/**
	 * Creates a new DetectorContext from the given parameters.
	 * @param params - Snapshot of all market, position, oracle, state, and risk data
	 */
	static create(params: DetectorContextParams): DetectorContext {
		return new DetectorContext(params);
	}

	// ── Identity ────────────────────────────────────────────────

	get conditionId(): ConditionId {
		return this.params.conditionId;
	}

	nowMs(): number {
		return (this.params.clock ?? SystemClock).now();
	}

	// ── MarketView ──────────────────────────────────────────────

	private bookForSide(side: MarketSide): BookSide {
		if (this.params.book) {
			return this.params.book[side];
		}
		return { bid: this.params.bestBid ?? null, ask: this.params.bestAsk ?? null };
	}

	bestBid(side: MarketSide): Decimal | null {
		return this.bookForSide(side).bid;
	}

	bestAsk(side: MarketSide): Decimal | null {
		return this.bookForSide(side).ask;
	}

	spread(side: MarketSide): Decimal | null {
		const { bid, ask } = this.bookForSide(side);
		if (bid === null || ask === null) return null;
		return ask.sub(bid);
	}

	spreadPct(side: MarketSide): number | null {
		const { bid, ask } = this.bookForSide(side);
		if (bid === null || ask === null) return null;
		const two = Decimal.from(2);
		const mid = bid.add(ask).div(two);
		if (mid.isZero()) return null;
		return ask.sub(bid).div(mid).toNumber() * 100;
	}

	timeRemainingMs(): number {
		return this.params.timeRemainingMs;
	}

	// ── PositionView ────────────────────────────────────────────

	positions(): readonly SdkPosition[] {
		return this.params.positions;
	}

	hasPosition(cid: ConditionId): boolean {
		return this.params.positions.some((p) => (p.conditionId as string) === (cid as string));
	}

	openCount(): number {
		return this.params.positions.length;
	}

	totalNotional(): Decimal {
		let total = Decimal.zero();
		for (const pos of this.params.positions) {
			total = total.add(pos.notional());
		}
		return total;
	}

	// ── OracleView ──────────────────────────────────────────────

	oraclePrice(): Decimal | null {
		return this.params.oraclePrice;
	}

	oracleAgeMs(): number | null {
		return this.params.oracleAgeMs;
	}

	oracleIsFresh(maxAgeMs: number): boolean {
		const age = this.params.oracleAgeMs;
		if (age === null) return false;
		return age <= maxAgeMs;
	}

	// ── StateView ───────────────────────────────────────────────

	state(): StrategyState {
		return this.params.state;
	}

	canOpen(): boolean {
		return this.params.state === StrategyState.Active;
	}

	canClose(): boolean {
		return (
			this.params.state === StrategyState.Active ||
			this.params.state === StrategyState.Paused ||
			this.params.state === StrategyState.ClosingOnly
		);
	}

	// ── RiskView ────────────────────────────────────────────────

	dailyPnl(): Decimal {
		return this.params.dailyPnl;
	}

	consecutiveLosses(): number {
		return this.params.consecutiveLosses;
	}

	availableBalance(): Decimal {
		return this.params.availableBalance;
	}
}
