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

/** Immutable collection of open positions with bounded closed position history. */
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

	/**
	 * Creates a new empty PositionManager.
	 * @param maxClosed - Maximum number of closed positions to retain (default 1000)
	 * @returns New empty PositionManager
	 */
	static create(maxClosed = DEFAULT_MAX_CLOSED): PositionManager {
		return new PositionManager(new Map(), [], maxClosed, Decimal.zero());
	}

	// ── Lifecycle ──────────────────────────────────────────────

	/**
	 * Opens a new position.
	 * @param cid - Condition ID
	 * @param tokenId - Market token ID
	 * @param side - Market side (yes/no)
	 * @param entryPrice - Entry price
	 * @param size - Position size
	 * @param entryTimeMs - Entry timestamp in milliseconds
	 * @returns Ok with new manager, or Err if position already exists
	 * @example
	 * const result = manager.open(cid, tokenId, MarketSide.Yes, Decimal.from("0.55"), Decimal.from("10"), Date.now());
	 */
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

	/**
	 * Closes an existing position.
	 * @param cid - Condition ID of position to close
	 * @param exitPrice - Exit price
	 * @param closedAtMs - Close timestamp in milliseconds
	 * @returns Object with new manager and realized P&L, or null if position not found
	 * @example
	 * const result = manager.close(cid, Decimal.from(55000), Date.now());
	 * if (result) { const { manager, pnl } = result; }
	 */
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

	/**
	 * Reduces an existing position size.
	 * @param cid - Condition ID of position to reduce
	 * @param reduceSize - Amount to reduce
	 * @param exitPrice - Exit price for the reduction
	 * @returns Object with new manager and realized P&L, or null if position not found or reduce fails
	 * @example
	 * const result = manager.reduce(cid, Decimal.from(0.5), Decimal.from(55000));
	 * if (result) { const { manager, pnl } = result; }
	 */
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

	/**
	 * @param cid - Condition ID to check
	 * @returns True if an open position exists for the given condition
	 */
	hasPosition(cid: ConditionId): boolean {
		return this.positions.has(cid as string);
	}

	/**
	 * @param cid - Condition ID to lookup
	 * @returns The open position, or null if not found
	 */
	get(cid: ConditionId): SdkPosition | null {
		return this.positions.get(cid as string) ?? null;
	}

	/** @returns Array of all open positions */
	allOpen(): readonly SdkPosition[] {
		return [...this.positions.values()];
	}

	/** @returns Number of open positions */
	openCount(): number {
		return this.positions.size;
	}

	/** @returns Number of closed positions retained */
	closedCount(): number {
		return this.closed.length;
	}

	/**
	 * @param count - Number of recent closed positions to return
	 * @returns Array of most recently closed positions (newest first)
	 * @example
	 * const last10 = manager.recentClosed(10);
	 */
	recentClosed(count: number): readonly ClosedPosition[] {
		return this.closed.slice(-count).reverse();
	}

	/** @returns Sum of notional values (cost basis) across all open positions */
	totalNotional(): Decimal {
		let total = Decimal.zero();
		for (const pos of this.positions.values()) {
			total = total.add(pos.notional());
		}
		return total;
	}

	/** @returns Total realized P&L from all closed/reduced positions */
	totalRealizedPnl(): Decimal {
		return this.accRealizedPnl;
	}
}
