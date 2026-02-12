import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { conditionId, marketTokenId } from "../shared/identifiers.js";
import { MarketSide } from "../shared/market-side.js";
import { isErr, isOk } from "../shared/result.js";
import { SdkPosition } from "./sdk-position.js";

const d = Decimal.from;

function openPosition(
	overrides: Partial<{
		entryPrice: string;
		size: string;
		entryTimeMs: number;
		side: MarketSide;
	}> = {},
): SdkPosition {
	return SdkPosition.open({
		conditionId: conditionId("cond-1"),
		tokenId: marketTokenId("tok-1"),
		side: overrides.side ?? MarketSide.Yes,
		entryPrice: d(overrides.entryPrice ?? "0.50"),
		size: d(overrides.size ?? "100"),
		entryTimeMs: overrides.entryTimeMs ?? 1000,
	});
}

describe("SdkPosition", () => {
	describe("open", () => {
		it("creates a position with correct fields", () => {
			const pos = openPosition();
			expect(pos.conditionId).toBe(conditionId("cond-1"));
			expect(pos.side).toBe(MarketSide.Yes);
			expect(pos.entryPrice.eq(d("0.50"))).toBe(true);
			expect(pos.size.eq(d("100"))).toBe(true);
			expect(pos.costBasis.eq(d("50"))).toBe(true);
			expect(pos.realizedPnl.isZero()).toBe(true);
			expect(pos.isClosed()).toBe(false);
		});

		it("initializes HWM to entry price", () => {
			const pos = openPosition({ entryPrice: "0.60" });
			expect(pos.highWaterMark.eq(d("0.60"))).toBe(true);
		});
	});

	describe("pnlTotal", () => {
		it("computes positive P&L", () => {
			const pos = openPosition({ entryPrice: "0.50", size: "100" });
			const pnl = pos.pnlTotal(d("0.60"));
			expect(pnl.eq(d("10"))).toBe(true);
		});

		it("computes negative P&L", () => {
			const pos = openPosition({ entryPrice: "0.50", size: "100" });
			const pnl = pos.pnlTotal(d("0.40"));
			expect(pnl.eq(d("-10"))).toBe(true);
		});

		it("returns zero P&L at entry price", () => {
			const pos = openPosition({ entryPrice: "0.50", size: "100" });
			expect(pos.pnlTotal(d("0.50")).isZero()).toBe(true);
		});
	});

	describe("roi", () => {
		it("computes ROI as fraction", () => {
			const pos = openPosition({ entryPrice: "0.50", size: "100" });
			const roi = pos.roi(d("0.55"));
			expect(roi.eq(d("0.1"))).toBe(true);
		});
	});

	describe("updateMark — HWM tracking", () => {
		it("updates HWM when price exceeds it", () => {
			const pos = openPosition({ entryPrice: "0.50" });
			const updated = pos.updateMark(d("0.70"));
			expect(updated.highWaterMark.eq(d("0.70"))).toBe(true);
		});

		it("keeps HWM when price is below", () => {
			const pos = openPosition({ entryPrice: "0.50" });
			const updated = pos.updateMark(d("0.40"));
			expect(updated.highWaterMark.eq(d("0.50"))).toBe(true);
		});

		it("is immutable — original unchanged", () => {
			const pos = openPosition({ entryPrice: "0.50" });
			const updated = pos.updateMark(d("0.70"));
			expect(pos.highWaterMark.eq(d("0.50"))).toBe(true);
			expect(updated.highWaterMark.eq(d("0.70"))).toBe(true);
		});
	});

	describe("drawdown", () => {
		it("computes drawdown from HWM", () => {
			const pos = openPosition({ entryPrice: "0.50" }).updateMark(d("1.00"));
			const dd = pos.drawdown(d("0.80"));
			expect(dd.eq(d("0.2"))).toBe(true);
		});

		it("returns zero when at HWM", () => {
			const pos = openPosition({ entryPrice: "0.50" });
			expect(pos.drawdown(d("0.50")).isZero()).toBe(true);
		});

		it("clamps to zero when above HWM", () => {
			const pos = openPosition({ entryPrice: "0.50" });
			expect(pos.drawdown(d("0.60")).isZero()).toBe(true);
		});
	});

	describe("tryReduce", () => {
		it("reduces size and accumulates realized P&L", () => {
			const pos = openPosition({ entryPrice: "0.50", size: "100" });
			const result = pos.tryReduce(d("50"), d("0.60"));
			expect(isOk(result)).toBe(true);
			if (isOk(result)) {
				const reduced = result.value;
				expect(reduced.size.eq(d("50"))).toBe(true);
				expect(reduced.realizedPnl.eq(d("5"))).toBe(true);
			}
		});

		it("errors on overfill", () => {
			const pos = openPosition({ entryPrice: "0.50", size: "100" });
			const result = pos.tryReduce(d("150"), d("0.60"));
			expect(isErr(result)).toBe(true);
		});

		it("fully closes when reducing entire size", () => {
			const pos = openPosition({ entryPrice: "0.50", size: "100" });
			const result = pos.tryReduce(d("100"), d("0.60"));
			expect(isOk(result)).toBe(true);
			if (isOk(result)) {
				expect(result.value.isClosed()).toBe(true);
			}
		});

		it("is immutable — original unchanged", () => {
			const pos = openPosition({ entryPrice: "0.50", size: "100" });
			pos.tryReduce(d("50"), d("0.60"));
			expect(pos.size.eq(d("100"))).toBe(true);
		});
	});

	describe("close", () => {
		it("returns closed position with P&L", () => {
			const pos = openPosition({ entryPrice: "0.50", size: "100" });
			const { position: closed, pnl } = pos.close(d("0.60"));
			expect(closed.isClosed()).toBe(true);
			expect(closed.size.isZero()).toBe(true);
			expect(pnl.eq(d("10"))).toBe(true);
		});
	});

	describe("notional", () => {
		it("returns cost basis", () => {
			const pos = openPosition({ entryPrice: "0.50", size: "100" });
			expect(pos.notional().eq(d("50"))).toBe(true);
		});
	});

	describe("value", () => {
		it("returns current market value", () => {
			const pos = openPosition({ entryPrice: "0.50", size: "100" });
			expect(pos.value(d("0.60")).eq(d("60"))).toBe(true);
		});
	});

	describe("NO-side positions", () => {
		it("computes P&L for NO tokens (price increase = profit)", () => {
			const pos = openPosition({ side: MarketSide.No, entryPrice: "0.40", size: "100" });
			const pnl = pos.pnlTotal(d("0.50"));
			// exitPrice*size - costBasis = 0.50*100 - 0.40*100 = 50-40 = 10
			expect(pnl.eq(d("10"))).toBe(true);
		});

		it("computes negative P&L for NO tokens (price decrease = loss)", () => {
			const pos = openPosition({ side: MarketSide.No, entryPrice: "0.40", size: "100" });
			const pnl = pos.pnlTotal(d("0.30"));
			// 0.30*100 - 0.40*100 = 30-40 = -10
			expect(pnl.eq(d("-10"))).toBe(true);
		});
	});

	describe("close with loss", () => {
		it("returns negative P&L when exit below entry", () => {
			const pos = openPosition({ entryPrice: "0.60", size: "100" });
			const { position: closed, pnl } = pos.close(d("0.40"));
			expect(closed.isClosed()).toBe(true);
			// 0.40*100 - 0.60*100 = 40-60 = -20
			expect(pnl.eq(d("-20"))).toBe(true);
			expect(closed.realizedPnl.eq(d("-20"))).toBe(true);
		});
	});

	describe("fillTracker", () => {
		it("tracks initial fill on open", () => {
			const pos = openPosition({ entryPrice: "0.50", size: "100" });
			expect(pos.fillTracker.fillCount()).toBe(1);
			expect(pos.fillTracker.totalSize().eq(d("100"))).toBe(true);
		});

		it("allFills returns fill records", () => {
			const pos = openPosition({ entryPrice: "0.50", size: "100" });
			const fills = pos.fillTracker.allFills();
			expect(fills.length).toBe(1);
			expect(fills[0]?.price.eq(d("0.50"))).toBe(true);
			expect(fills[0]?.timestampMs).toBe(1000);
		});
	});
});
