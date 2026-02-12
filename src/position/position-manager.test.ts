import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { conditionId, marketTokenId } from "../shared/identifiers.js";
import { MarketSide } from "../shared/market-side.js";
import { isErr, isOk, unwrap } from "../shared/result.js";
import { PositionManager } from "./position-manager.js";

const d = Decimal.from;
const CID1 = conditionId("cond-1");
const CID2 = conditionId("cond-2");
const TID1 = marketTokenId("tok-1");

function managerWithPosition(): PositionManager {
	const result = PositionManager.create().open(
		CID1,
		TID1,
		MarketSide.Yes,
		d("0.50"),
		d("100"),
		1000,
	);
	return unwrap(result);
}

describe("PositionManager", () => {
	describe("open", () => {
		it("opens a new position", () => {
			const mgr = managerWithPosition();
			expect(mgr.hasPosition(CID1)).toBe(true);
			expect(mgr.openCount()).toBe(1);
		});

		it("rejects duplicate positions with Result error", () => {
			const mgr = managerWithPosition();
			const result = mgr.open(CID1, TID1, MarketSide.Yes, d("0.60"), d("50"), 2000);
			expect(isErr(result)).toBe(true);
			if (isErr(result)) {
				expect(result.error).toContain("already open");
			}
		});
	});

	describe("close", () => {
		it("closes a position and returns P&L", () => {
			const mgr = managerWithPosition();
			const closed = mgr.close(CID1, d("0.60"), 2000);
			expect(closed).not.toBeNull();
			if (closed) {
				expect(closed.pnl.eq(d("10"))).toBe(true);
				expect(closed.manager.hasPosition(CID1)).toBe(false);
				expect(closed.manager.openCount()).toBe(0);
				expect(closed.manager.closedCount()).toBe(1);
			}
		});

		it("returns null for non-existent position", () => {
			const mgr = PositionManager.create();
			const result = mgr.close(CID1, d("0.60"), 2000);
			expect(result).toBeNull();
		});
	});

	describe("reduce", () => {
		it("partially reduces a position", () => {
			const mgr = managerWithPosition();
			const result = mgr.reduce(CID1, d("50"), d("0.60"));
			expect(result).not.toBeNull();
			if (result) {
				expect(result.manager.get(CID1)?.size.eq(d("50"))).toBe(true);
				expect(result.pnl.eq(d("5"))).toBe(true);
			}
		});

		it("returns null for non-existent position", () => {
			const mgr = PositionManager.create();
			expect(mgr.reduce(CID2, d("50"), d("0.60"))).toBeNull();
		});

		it("returns null for overfill (reduce more than size)", () => {
			const mgr = managerWithPosition();
			const result = mgr.reduce(CID1, d("200"), d("0.60"));
			expect(result).toBeNull();
		});
	});

	describe("queries", () => {
		it("gets a position by condition ID", () => {
			const mgr = managerWithPosition();
			const pos = mgr.get(CID1);
			expect(pos).not.toBeNull();
			expect(pos?.entryPrice.eq(d("0.50"))).toBe(true);
		});

		it("returns null for non-existent position", () => {
			const mgr = PositionManager.create();
			expect(mgr.get(CID1)).toBeNull();
		});

		it("lists all open positions", () => {
			const r1 = PositionManager.create().open(
				CID1,
				TID1,
				MarketSide.Yes,
				d("0.50"),
				d("100"),
				1000,
			);
			const r2 = unwrap(r1).open(CID2, TID1, MarketSide.No, d("0.40"), d("200"), 2000);
			const mgr = unwrap(r2);
			expect(mgr.openCount()).toBe(2);
			expect(mgr.allOpen().length).toBe(2);
		});
	});

	describe("closed history", () => {
		it("tracks closed positions in order", () => {
			const mgr = managerWithPosition();
			const closed = mgr.close(CID1, d("0.60"), 2000);
			expect(closed).not.toBeNull();
			if (closed) {
				const recent = closed.manager.recentClosed(5);
				expect(recent.length).toBe(1);
				expect(recent[0]?.realizedPnl.eq(d("10"))).toBe(true);
			}
		});

		it("bounds history to maxClosed", () => {
			let mgr = PositionManager.create(2);
			for (let i = 0; i < 3; i++) {
				const cid = conditionId(`cond-${i}`);
				const openResult = mgr.open(cid, TID1, MarketSide.Yes, d("0.50"), d("100"), i * 1000);
				if (isOk(openResult)) mgr = openResult.value;
				const result = mgr.close(cid, d("0.60"), i * 1000 + 500);
				if (result) mgr = result.manager;
			}
			expect(mgr.closedCount()).toBe(2);
		});
	});

	describe("aggregate stats", () => {
		it("computes total notional across open positions", () => {
			const r1 = PositionManager.create().open(
				CID1,
				TID1,
				MarketSide.Yes,
				d("0.50"),
				d("100"),
				1000,
			);
			const r2 = unwrap(r1).open(CID2, TID1, MarketSide.No, d("0.40"), d("200"), 2000);
			const mgr = unwrap(r2);
			expect(mgr.totalNotional().eq(d("130"))).toBe(true);
		});

		it("computes realized P&L across closed positions", () => {
			const mgr = managerWithPosition();
			const result = mgr.close(CID1, d("0.60"), 2000);
			if (result) {
				expect(result.manager.totalRealizedPnl().eq(d("10"))).toBe(true);
			}
		});
	});
});
