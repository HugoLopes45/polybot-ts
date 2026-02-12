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

	pnlTotal(exitPrice: Decimal): Decimal {
		return exitPrice.mul(this.size).sub(this.costBasis);
	}

	roi(exitPrice: Decimal): Decimal {
		if (this.costBasis.isZero()) return Decimal.zero();
		return this.pnlTotal(exitPrice).div(this.costBasis);
	}

	// ── HWM & Drawdown ──────────────────────────────────────────

	updateMark(currentPrice: Decimal): SdkPosition {
		const newHwm = Decimal.max(this.highWaterMark, currentPrice);
		if (newHwm.eq(this.highWaterMark)) return this;
		return this.copyWith({ highWaterMark: newHwm });
	}

	drawdown(currentPrice: Decimal): Decimal {
		if (this.highWaterMark.isZero()) return Decimal.zero();
		const dd = this.highWaterMark.sub(currentPrice).div(this.highWaterMark);
		return dd.isNegative() ? Decimal.zero() : dd;
	}

	// ── Mutations (return new instances) ────────────────────────

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

	isClosed(): boolean {
		return this.size.isZero();
	}

	notional(): Decimal {
		return this.costBasis;
	}

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
