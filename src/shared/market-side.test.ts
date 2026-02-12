import { describe, expect, it } from "vitest";
import { MarketSide, complementPrice, oppositeSide } from "./market-side.js";

describe("MarketSide", () => {
	it("has Yes and No variants", () => {
		expect(MarketSide.Yes).toBe("yes");
		expect(MarketSide.No).toBe("no");
	});

	it("oppositeSide flips correctly", () => {
		expect(oppositeSide(MarketSide.Yes)).toBe(MarketSide.No);
		expect(oppositeSide(MarketSide.No)).toBe(MarketSide.Yes);
	});

	it("complementPrice: buy YES @ 0.65 ≈ sell NO @ 0.35", () => {
		expect(complementPrice(0.65)).toBeCloseTo(0.35);
		expect(complementPrice(0)).toBe(1);
		expect(complementPrice(1)).toBe(0);
	});
});
