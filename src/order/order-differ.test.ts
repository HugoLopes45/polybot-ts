import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import type { DesiredOrder, LiveOrder } from "./order-differ.js";
import { diffOrders } from "./order-differ.js";

describe("diffOrders", () => {
	describe("empty inputs", () => {
		it("returns empty actions when no desired and no live orders", () => {
			const actions = diffOrders([], []);
			expect(actions).toEqual([]);
		});
	});

	describe("new desired orders", () => {
		it("returns place actions when desired orders exist but no live orders", () => {
			const desired: DesiredOrder[] = [
				{
					tokenId: "token1",
					side: "buy",
					price: Decimal.from("0.5"),
					size: Decimal.from("10"),
				},
				{
					tokenId: "token2",
					side: "sell",
					price: Decimal.from("0.7"),
					size: Decimal.from("20"),
				},
			];

			const actions = diffOrders(desired, []);

			expect(actions).toHaveLength(2);
			expect(actions[0]).toEqual({ type: "place", order: desired[0] });
			expect(actions[1]).toEqual({ type: "place", order: desired[1] });
		});
	});

	describe("cancel existing orders", () => {
		it("returns cancel actions when live orders exist but no desired orders", () => {
			const live: LiveOrder[] = [
				{
					orderId: "order1",
					tokenId: "token1",
					side: "buy",
					price: Decimal.from("0.5"),
					size: Decimal.from("10"),
				},
				{
					orderId: "order2",
					tokenId: "token2",
					side: "sell",
					price: Decimal.from("0.7"),
					size: Decimal.from("20"),
				},
			];

			const actions = diffOrders([], live);

			expect(actions).toHaveLength(2);
			expect(actions).toContainEqual({
				type: "cancel",
				orderId: "order1",
				reason: "no longer desired",
			});
			expect(actions).toContainEqual({
				type: "cancel",
				orderId: "order2",
				reason: "no longer desired",
			});
		});
	});

	describe("exact match", () => {
		it("returns keep action when desired matches live exactly", () => {
			const desired: DesiredOrder[] = [
				{
					tokenId: "token1",
					side: "buy",
					price: Decimal.from("0.5"),
					size: Decimal.from("10"),
				},
			];

			const live: LiveOrder[] = [
				{
					orderId: "order1",
					tokenId: "token1",
					side: "buy",
					price: Decimal.from("0.5"),
					size: Decimal.from("10"),
				},
			];

			const actions = diffOrders(desired, live);

			expect(actions).toEqual([{ type: "keep", orderId: "order1" }]);
		});
	});

	describe("price tolerance", () => {
		it("returns keep when price diff within default tolerance (0.001)", () => {
			const desired: DesiredOrder[] = [
				{
					tokenId: "token1",
					side: "buy",
					price: Decimal.from("0.5005"),
					size: Decimal.from("10"),
				},
			];

			const live: LiveOrder[] = [
				{
					orderId: "order1",
					tokenId: "token1",
					side: "buy",
					price: Decimal.from("0.5"),
					size: Decimal.from("10"),
				},
			];

			const actions = diffOrders(desired, live);

			expect(actions).toEqual([{ type: "keep", orderId: "order1" }]);
		});

		it("returns amend when price diff beyond default tolerance", () => {
			const desired: DesiredOrder[] = [
				{
					tokenId: "token1",
					side: "buy",
					price: Decimal.from("0.502"),
					size: Decimal.from("10"),
				},
			];

			const live: LiveOrder[] = [
				{
					orderId: "order1",
					tokenId: "token1",
					side: "buy",
					price: Decimal.from("0.5"),
					size: Decimal.from("10"),
				},
			];

			const actions = diffOrders(desired, live);

			expect(actions).toEqual([
				{
					type: "amend",
					orderId: "order1",
					newPrice: Decimal.from("0.502"),
					newSize: Decimal.from("10"),
				},
			]);
		});

		it("respects custom price tolerance", () => {
			const desired: DesiredOrder[] = [
				{
					tokenId: "token1",
					side: "buy",
					price: Decimal.from("0.51"),
					size: Decimal.from("10"),
				},
			];

			const live: LiveOrder[] = [
				{
					orderId: "order1",
					tokenId: "token1",
					side: "buy",
					price: Decimal.from("0.5"),
					size: Decimal.from("10"),
				},
			];

			const actions = diffOrders(desired, live, {
				priceTolerance: Decimal.from("0.02"),
			});

			expect(actions).toEqual([{ type: "keep", orderId: "order1" }]);
		});
	});

	describe("size tolerance", () => {
		it("returns keep when size diff within default tolerance (5%)", () => {
			const desired: DesiredOrder[] = [
				{
					tokenId: "token1",
					side: "buy",
					price: Decimal.from("0.5"),
					size: Decimal.from("10.4"),
				},
			];

			const live: LiveOrder[] = [
				{
					orderId: "order1",
					tokenId: "token1",
					side: "buy",
					price: Decimal.from("0.5"),
					size: Decimal.from("10"),
				},
			];

			const actions = diffOrders(desired, live);

			expect(actions).toEqual([{ type: "keep", orderId: "order1" }]);
		});

		it("returns amend when size diff beyond default tolerance", () => {
			const desired: DesiredOrder[] = [
				{
					tokenId: "token1",
					side: "buy",
					price: Decimal.from("0.5"),
					size: Decimal.from("11"),
				},
			];

			const live: LiveOrder[] = [
				{
					orderId: "order1",
					tokenId: "token1",
					side: "buy",
					price: Decimal.from("0.5"),
					size: Decimal.from("10"),
				},
			];

			const actions = diffOrders(desired, live);

			expect(actions).toEqual([
				{
					type: "amend",
					orderId: "order1",
					newPrice: Decimal.from("0.5"),
					newSize: Decimal.from("11"),
				},
			]);
		});

		it("respects custom size tolerance", () => {
			const desired: DesiredOrder[] = [
				{
					tokenId: "token1",
					side: "buy",
					price: Decimal.from("0.5"),
					size: Decimal.from("12"),
				},
			];

			const live: LiveOrder[] = [
				{
					orderId: "order1",
					tokenId: "token1",
					side: "buy",
					price: Decimal.from("0.5"),
					size: Decimal.from("10"),
				},
			];

			const actions = diffOrders(desired, live, {
				sizeTolerance: Decimal.from("0.25"),
			});

			expect(actions).toEqual([{ type: "keep", orderId: "order1" }]);
		});
	});

	describe("token-side segregation", () => {
		it("does not match YES buy with NO buy", () => {
			const desired: DesiredOrder[] = [
				{
					tokenId: "token-yes",
					side: "buy",
					price: Decimal.from("0.6"),
					size: Decimal.from("10"),
				},
			];

			const live: LiveOrder[] = [
				{
					orderId: "order1",
					tokenId: "token-no",
					side: "buy",
					price: Decimal.from("0.6"),
					size: Decimal.from("10"),
				},
			];

			const actions = diffOrders(desired, live);

			expect(actions).toHaveLength(2);
			expect(actions).toContainEqual({ type: "place", order: desired[0] });
			expect(actions).toContainEqual({
				type: "cancel",
				orderId: "order1",
				reason: "no longer desired",
			});
		});

		it("does not match buy with sell on same token", () => {
			const desired: DesiredOrder[] = [
				{
					tokenId: "token1",
					side: "buy",
					price: Decimal.from("0.5"),
					size: Decimal.from("10"),
				},
			];

			const live: LiveOrder[] = [
				{
					orderId: "order1",
					tokenId: "token1",
					side: "sell",
					price: Decimal.from("0.5"),
					size: Decimal.from("10"),
				},
			];

			const actions = diffOrders(desired, live);

			expect(actions).toHaveLength(2);
			expect(actions).toContainEqual({ type: "place", order: desired[0] });
			expect(actions).toContainEqual({
				type: "cancel",
				orderId: "order1",
				reason: "no longer desired",
			});
		});
	});

	describe("multiple orders for same token-side", () => {
		it("matches first available live order to desired, cancels extra live orders", () => {
			const desired: DesiredOrder[] = [
				{
					tokenId: "token1",
					side: "buy",
					price: Decimal.from("0.5"),
					size: Decimal.from("10"),
				},
			];

			const live: LiveOrder[] = [
				{
					orderId: "order1",
					tokenId: "token1",
					side: "buy",
					price: Decimal.from("0.5"),
					size: Decimal.from("10"),
				},
				{
					orderId: "order2",
					tokenId: "token1",
					side: "buy",
					price: Decimal.from("0.51"),
					size: Decimal.from("15"),
				},
			];

			const actions = diffOrders(desired, live);

			expect(actions).toHaveLength(2);
			expect(actions).toContainEqual({ type: "keep", orderId: "order1" });
			expect(actions).toContainEqual({
				type: "cancel",
				orderId: "order2",
				reason: "no longer desired",
			});
		});

		it("places multiple desired orders for same token-side if only one live order exists", () => {
			const desired: DesiredOrder[] = [
				{
					tokenId: "token1",
					side: "buy",
					price: Decimal.from("0.5"),
					size: Decimal.from("10"),
				},
				{
					tokenId: "token1",
					side: "buy",
					price: Decimal.from("0.51"),
					size: Decimal.from("15"),
				},
			];

			const live: LiveOrder[] = [
				{
					orderId: "order1",
					tokenId: "token1",
					side: "buy",
					price: Decimal.from("0.5"),
					size: Decimal.from("10"),
				},
			];

			const actions = diffOrders(desired, live);

			expect(actions).toHaveLength(2);
			expect(actions).toContainEqual({ type: "keep", orderId: "order1" });
			expect(actions).toContainEqual({ type: "place", order: desired[1] });
		});
	});

	describe("mixed scenarios", () => {
		it("combines keep, amend, cancel, and place actions", () => {
			const desired: DesiredOrder[] = [
				{
					tokenId: "token1",
					side: "buy",
					price: Decimal.from("0.5"),
					size: Decimal.from("10"),
				},
				{
					tokenId: "token2",
					side: "sell",
					price: Decimal.from("0.65"),
					size: Decimal.from("20"),
				},
				{
					tokenId: "token3",
					side: "buy",
					price: Decimal.from("0.8"),
					size: Decimal.from("5"),
				},
			];

			const live: LiveOrder[] = [
				{
					orderId: "order1",
					tokenId: "token1",
					side: "buy",
					price: Decimal.from("0.5"),
					size: Decimal.from("10"),
				},
				{
					orderId: "order2",
					tokenId: "token2",
					side: "sell",
					price: Decimal.from("0.7"),
					size: Decimal.from("20"),
				},
				{
					orderId: "order4",
					tokenId: "token4",
					side: "sell",
					price: Decimal.from("0.3"),
					size: Decimal.from("15"),
				},
			];

			const actions = diffOrders(desired, live);

			expect(actions).toHaveLength(4);
			expect(actions).toContainEqual({ type: "keep", orderId: "order1" });
			expect(actions).toContainEqual({
				type: "amend",
				orderId: "order2",
				newPrice: Decimal.from("0.65"),
				newSize: Decimal.from("20"),
			});
			expect(actions).toContainEqual({ type: "place", order: desired[2] });
			expect(actions).toContainEqual({
				type: "cancel",
				orderId: "order4",
				reason: "no longer desired",
			});
		});
	});

	describe("tolerance edge cases", () => {
		it.each([
			{ priceDiff: "0.0009", withinTolerance: true },
			{ priceDiff: "0.001", withinTolerance: true },
			{ priceDiff: "0.0011", withinTolerance: false },
		])("handles price tolerance boundary at $priceDiff", ({ priceDiff, withinTolerance }) => {
			const desired: DesiredOrder[] = [
				{
					tokenId: "token1",
					side: "buy",
					price: Decimal.from("0.5").add(Decimal.from(priceDiff)),
					size: Decimal.from("10"),
				},
			];

			const live: LiveOrder[] = [
				{
					orderId: "order1",
					tokenId: "token1",
					side: "buy",
					price: Decimal.from("0.5"),
					size: Decimal.from("10"),
				},
			];

			const actions = diffOrders(desired, live);

			if (withinTolerance) {
				expect(actions).toEqual([{ type: "keep", orderId: "order1" }]);
			} else {
				expect(actions[0]?.type).toBe("amend");
			}
		});

		it.each([
			{ sizeMultiplier: "1.04", withinTolerance: true },
			{ sizeMultiplier: "1.05", withinTolerance: true },
			{ sizeMultiplier: "1.06", withinTolerance: false },
		])(
			"handles size tolerance boundary at $sizeMultiplier",
			({ sizeMultiplier, withinTolerance }) => {
				const desired: DesiredOrder[] = [
					{
						tokenId: "token1",
						side: "buy",
						price: Decimal.from("0.5"),
						size: Decimal.from("10").mul(Decimal.from(sizeMultiplier)),
					},
				];

				const live: LiveOrder[] = [
					{
						orderId: "order1",
						tokenId: "token1",
						side: "buy",
						price: Decimal.from("0.5"),
						size: Decimal.from("10"),
					},
				];

				const actions = diffOrders(desired, live);

				if (withinTolerance) {
					expect(actions).toEqual([{ type: "keep", orderId: "order1" }]);
				} else {
					expect(actions[0]?.type).toBe("amend");
				}
			},
		);
	});
});
