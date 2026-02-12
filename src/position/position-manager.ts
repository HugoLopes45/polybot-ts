/**
 * PositionManager — immutable collection of open positions with bounded history.
 */

import { Decimal } from "../shared/decimal.js";
import type { ConditionId, MarketTokenId } from "../shared/identifiers.js";
import type { MarketSide } from "../shared/market-side.js";
import { type Result, err, isOk, ok, unwrap } from "../shared/result.js";
import { SdkPosition } from "./sdk-position.js";
import type { ClosedPosition } from "./types.js";

const DEFAULT_MAX_CLOSED = 1000;

export class PositionManager {
	private readonly positions: ReadonlyMap<string, SdkPosition>;
	private readonly closed: readonly ClosedPosition[];
	private readonly maxClosed: number;
	private readonly accRealizedPnl: Decimal;

	private constructor(
		positions: ReadonlyMap<string, SdkPosition>,
		closed: readonly ClosedPosition[],
		maxClosed: number,
		accRealizedPnl: Decimal,
	) {
		this.positions = positions;
		this.closed = closed;
		this.maxClosed = maxClosed;
		this.accRealizedPnl = accRealizedPnl;
	}

	static create(maxClosed = DEFAULT_MAX_CLOSED): PositionManager {
		return new PositionManager(new Map(), [], maxClosed, Decimal.zero());
	}

	// ── Lifecycle ──────────────────────────────────────────────

	open(
		cid: ConditionId,
		tokenId: MarketTokenId,
		side: MarketSide,
		entryPrice: Decimal,
		size: Decimal,
		entryTimeMs: number,
	): Result<PositionManager, string> {
		const key = cid as string;
		if (this.positions.has(key)) {
			return err(`Position already open for ${key}`);
		}

		const pos = SdkPosition.open({
			conditionId: cid,
			tokenId,
			side,
			entryPrice,
			size,
			entryTimeMs,
		});
		const newPositions = new Map(this.positions);
		newPositions.set(key, pos);
		return ok(new PositionManager(newPositions, this.closed, this.maxClosed, this.accRealizedPnl));
	}

	close(
		cid: ConditionId,
		exitPrice: Decimal,
		closedAtMs: number,
	): { manager: PositionManager; pnl: Decimal } | null {
		const key = cid as string;
		const pos = this.positions.get(key);
		if (!pos) return null;

		const { position: closedPos, pnl } = pos.close(exitPrice);
		const newPositions = new Map(this.positions);
		newPositions.delete(key);

		const entry: ClosedPosition = {
			snapshot: {
				conditionId: pos.conditionId,
				tokenId: pos.tokenId,
				side: pos.side,
				entryPrice: pos.entryPrice,
				size: pos.size,
				costBasis: pos.costBasis,
				realizedPnl: closedPos.realizedPnl,
				highWaterMark: pos.highWaterMark,
				entryTimeMs: pos.entryTimeMs,
			},
			exitPrice,
			realizedPnl: pnl,
			closedAtMs,
		};

		let newClosed = [...this.closed, entry];
		if (newClosed.length > this.maxClosed) {
			newClosed = newClosed.slice(newClosed.length - this.maxClosed);
		}

		return {
			manager: new PositionManager(
				newPositions,
				newClosed,
				this.maxClosed,
				this.accRealizedPnl.add(pnl),
			),
			pnl,
		};
	}

	reduce(
		cid: ConditionId,
		reduceSize: Decimal,
		exitPrice: Decimal,
	): { manager: PositionManager; pnl: Decimal } | null {
		const key = cid as string;
		const pos = this.positions.get(key);
		if (!pos) return null;

		const result = pos.tryReduce(reduceSize, exitPrice);
		if (!isOk(result)) return null;

		const reduced = unwrap(result);
		const pnlPerUnit = exitPrice.sub(pos.entryPrice);
		const pnl = pnlPerUnit.mul(reduceSize);

		const newPositions = new Map(this.positions);
		if (reduced.isClosed()) {
			newPositions.delete(key);
		} else {
			newPositions.set(key, reduced);
		}

		return {
			manager: new PositionManager(
				newPositions,
				this.closed,
				this.maxClosed,
				this.accRealizedPnl.add(pnl),
			),
			pnl,
		};
	}

	// ── Queries ──────────────────────────────────────────────────

	hasPosition(cid: ConditionId): boolean {
		return this.positions.has(cid as string);
	}

	get(cid: ConditionId): SdkPosition | null {
		return this.positions.get(cid as string) ?? null;
	}

	allOpen(): readonly SdkPosition[] {
		return [...this.positions.values()];
	}

	openCount(): number {
		return this.positions.size;
	}

	closedCount(): number {
		return this.closed.length;
	}

	recentClosed(count: number): readonly ClosedPosition[] {
		return this.closed.slice(-count).reverse();
	}

	totalNotional(): Decimal {
		let total = Decimal.zero();
		for (const pos of this.positions.values()) {
			total = total.add(pos.notional());
		}
		return total;
	}

	totalRealizedPnl(): Decimal {
		return this.accRealizedPnl;
	}
}
