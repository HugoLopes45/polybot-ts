/**
 * SdkPosition — immutable position aggregate.
 *
 * All mutations (updateMark, tryReduce, close) return new instances.
 * Satisfies the PositionLike interface from signal/types.ts.
 */

import { Decimal } from "../shared/decimal.js";
import type { ConditionId, MarketTokenId } from "../shared/identifiers.js";
import type { MarketSide } from "../shared/market-side.js";
import type { Result } from "../shared/result.js";
import { err, ok } from "../shared/result.js";
import { CostBasis } from "./cost-basis.js";

/** Immutable position aggregate tracking entry, P&L, and fill history. All mutations return new instances. */
export class SdkPosition {
	readonly conditionId: ConditionId;
	readonly tokenId: MarketTokenId;
	readonly side: MarketSide;
	readonly entryPrice: Decimal;
	readonly size: Decimal;
	readonly costBasis: Decimal;
	readonly realizedPnl: Decimal;
	readonly highWaterMark: Decimal;
	readonly entryTimeMs: number;
	readonly fillTracker: CostBasis;

	private constructor(params: {
		conditionId: ConditionId;
		tokenId: MarketTokenId;
		side: MarketSide;
		entryPrice: Decimal;
		size: Decimal;
		costBasis: Decimal;
		realizedPnl: Decimal;
		highWaterMark: Decimal;
		entryTimeMs: number;
		fillTracker: CostBasis;
	}) {
		this.conditionId = params.conditionId;
		this.tokenId = params.tokenId;
		this.side = params.side;
		this.entryPrice = params.entryPrice;
		this.size = params.size;
		this.costBasis = params.costBasis;
		this.realizedPnl = params.realizedPnl;
		this.highWaterMark = params.highWaterMark;
		this.entryTimeMs = params.entryTimeMs;
		this.fillTracker = params.fillTracker;
	}

	/**
	 * Opens a new position.
	 * @param params - Position opening parameters
	 * @returns New SdkPosition instance
	 * @example
	 * const pos = SdkPosition.open({
	 *   conditionId: "0x123...",
	 *   tokenId: "ETH-USD",
	 *   side: "long",
	 *   entryPrice: Decimal.from(50000),
	 *   size: Decimal.from(1),
	 *   entryTimeMs: Date.now()
	 * });
	 */
	static open(params: {
		conditionId: ConditionId;
		tokenId: MarketTokenId;
		side: MarketSide;
		entryPrice: Decimal;
		size: Decimal;
		entryTimeMs: number;
	}): SdkPosition {
		const costBasis = params.entryPrice.mul(params.size);
		const fillTracker = CostBasis.create().addFill({
			price: params.entryPrice,
			size: params.size,
			timestampMs: params.entryTimeMs,
		});
		return new SdkPosition({
			...params,
			costBasis,
			realizedPnl: Decimal.zero(),
			highWaterMark: params.entryPrice,
			fillTracker,
		});
	}

	// ── P&L ──────────────────────────────────────────────────────

	/**
	 * Calculates total unrealized P&L at the given exit price.
	 * @param exitPrice - Current or potential exit price
	 * @returns Unrealized P&L (exit value - cost basis)
	 * @example
	 * const pnl = pos.pnlTotal(Decimal.from(55000));
	 */
	pnlTotal(exitPrice: Decimal): Decimal {
		return exitPrice.mul(this.size).sub(this.costBasis);
	}

	/**
	 * Calculates ROI (Return on Investment) as a decimal.
	 * @param exitPrice - Current or potential exit price
	 * @returns ROI (pnl / cost basis), or zero if cost basis is zero
	 * @example
	 * const roi = pos.roi(Decimal.from(55000)); // 0.1 = 10%
	 */
	roi(exitPrice: Decimal): Decimal {
		if (this.costBasis.isZero()) return Decimal.zero();
		return this.pnlTotal(exitPrice).div(this.costBasis);
	}

	// ── HWM & Drawdown ──────────────────────────────────────────

	/**
	 * Updates high water mark if current price is higher. Returns same instance if not.
	 * @param currentPrice - Current market price
	 * @returns New SdkPosition with updated HWM, or same instance if unchanged
	 */
	updateMark(currentPrice: Decimal): SdkPosition {
		const newHwm = Decimal.max(this.highWaterMark, currentPrice);
		if (newHwm.eq(this.highWaterMark)) return this;
		return this.copyWith({ highWaterMark: newHwm });
	}

	/**
	 * Calculates drawdown from high water mark.
	 * @param currentPrice - Current market price
	 * @returns Drawdown as decimal (0 = no drawdown), always non-negative
	 * @example
	 * const dd = pos.drawdown(Decimal.from(45000)); // 0.1 = 10% drawdown
	 */
	drawdown(currentPrice: Decimal): Decimal {
		if (this.highWaterMark.isZero()) return Decimal.zero();
		const dd = this.highWaterMark.sub(currentPrice).div(this.highWaterMark);
		return dd.isNegative() ? Decimal.zero() : dd;
	}

	// ── Mutations (return new instances) ────────────────────────

	/**
	 * Attempts to reduce position size, realizing P&L for the reduced portion.
	 * @param reduceSize - Amount to reduce
	 * @param exitPrice - Price at which reduction occurs
	 * @returns Ok with new position, or Err if reduceSize exceeds current size
	 * @example
	 * const result = pos.tryReduce(Decimal.from(0.5), Decimal.from(55000));
	 * if (result.ok) { const reduced = result.value; }
	 */
	tryReduce(reduceSize: Decimal, exitPrice: Decimal): Result<SdkPosition, string> {
		if (reduceSize.gt(this.size)) {
			return err(`Cannot reduce by ${reduceSize.toString()}: only ${this.size.toString()} held`);
		}

		const pnlPerUnit = exitPrice.sub(this.entryPrice);
		const realizedFromReduce = pnlPerUnit.mul(reduceSize);
		const newSize = this.size.sub(reduceSize);
		const newCostBasis = this.entryPrice.mul(newSize);

		return ok(
			this.copyWith({
				size: newSize,
				costBasis: newCostBasis,
				realizedPnl: this.realizedPnl.add(realizedFromReduce),
			}),
		);
	}

	/**
	 * Closes the position entirely at the given exit price.
	 * @param exitPrice - Price at which position is closed
	 * @returns Object with closed position (zero size) and realized P&L
	 * @example
	 * const { position, pnl } = pos.close(Decimal.from(55000));
	 */
	close(exitPrice: Decimal): { position: SdkPosition; pnl: Decimal } {
		const pnl = this.pnlTotal(exitPrice);
		const closed = this.copyWith({
			size: Decimal.zero(),
			costBasis: Decimal.zero(),
			realizedPnl: this.realizedPnl.add(pnl),
		});
		return { position: closed, pnl };
	}

	// ── Queries ──────────────────────────────────────────────────

	/** @returns True if position size is zero (closed) */
	isClosed(): boolean {
		return this.size.isZero();
	}

	/** @returns Notional value (same as cost basis) */
	notional(): Decimal {
		return this.costBasis;
	}

	/**
	 * Calculates current market value.
	 * @param currentPrice - Current market price
	 * @returns Current value (price × size)
	 * @example
	 * const val = pos.value(Decimal.from(55000));
	 */
	value(currentPrice: Decimal): Decimal {
		return currentPrice.mul(this.size);
	}

	// ── Internal ────────────────────────────────────────────────

	private copyWith(
		overrides: Partial<{
			size: Decimal;
			costBasis: Decimal;
			realizedPnl: Decimal;
			highWaterMark: Decimal;
			fillTracker: CostBasis;
		}>,
	): SdkPosition {
		return new SdkPosition({
			conditionId: this.conditionId,
			tokenId: this.tokenId,
			side: this.side,
			entryPrice: this.entryPrice,
			size: overrides.size ?? this.size,
			costBasis: overrides.costBasis ?? this.costBasis,
			realizedPnl: overrides.realizedPnl ?? this.realizedPnl,
			highWaterMark: overrides.highWaterMark ?? this.highWaterMark,
			entryTimeMs: this.entryTimeMs,
			fillTracker: overrides.fillTracker ?? this.fillTracker,
		});
	}
}
