/**
 * Order Differ — compute minimal action set to transition from live orders to desired orders.
 *
 * Matches by tokenId + side, uses tolerance to prevent churn.
 */

import { Decimal } from "../shared/decimal.js";

export interface DesiredOrder {
	readonly tokenId: string;
	readonly side: "buy" | "sell";
	readonly price: Decimal;
	readonly size: Decimal;
}

export interface LiveOrder {
	readonly orderId: string;
	readonly tokenId: string;
	readonly side: "buy" | "sell";
	readonly price: Decimal;
	readonly size: Decimal;
}

export type DiffAction =
	| { readonly type: "keep"; readonly orderId: string }
	| { readonly type: "cancel"; readonly orderId: string; readonly reason: string }
	| { readonly type: "place"; readonly order: DesiredOrder }
	| {
			readonly type: "amend";
			readonly orderId: string;
			readonly newPrice: Decimal;
			readonly newSize: Decimal;
	  };

export interface DiffConfig {
	/** Price tolerance: don't amend if price diff < this (in absolute terms). Default 0.001 */
	readonly priceTolerance?: Decimal;
	/** Size tolerance: don't amend if size diff < this fraction. Default 0.05 (5%) */
	readonly sizeTolerance?: Decimal;
}

/**
 * Compute minimal action set to transition from live orders to desired orders.
 * Matches by tokenId + side, uses tolerance to prevent churn.
 */
export function diffOrders(
	desired: readonly DesiredOrder[],
	live: readonly LiveOrder[],
	config?: DiffConfig,
): readonly DiffAction[] {
	const priceTol = config?.priceTolerance ?? null;
	const sizeTol = config?.sizeTolerance ?? null;
	const actions: DiffAction[] = [];

	const liveByKey = groupBy(live, (o) => makeKey(o.tokenId, o.side));
	const desiredByKey = groupBy(desired, (o) => makeKey(o.tokenId, o.side));

	const allKeys = new Set([...liveByKey.keys(), ...desiredByKey.keys()]);

	for (const key of allKeys) {
		const desiredList = desiredByKey.get(key) ?? [];
		const liveList = liveByKey.get(key) ?? [];

		const matchedLive = new Set<string>();

		for (const desiredOrder of desiredList) {
			let matched = false;

			for (const liveOrder of liveList) {
				if (matchedLive.has(liveOrder.orderId)) {
					continue;
				}

				const withinTolerance = isWithinTolerance(desiredOrder, liveOrder, priceTol, sizeTol);
				if (withinTolerance) {
					actions.push({ type: "keep", orderId: liveOrder.orderId });
				} else {
					actions.push({
						type: "amend",
						orderId: liveOrder.orderId,
						newPrice: desiredOrder.price,
						newSize: desiredOrder.size,
					});
				}
				matchedLive.add(liveOrder.orderId);
				matched = true;
				break;
			}

			if (!matched) {
				actions.push({ type: "place", order: desiredOrder });
			}
		}

		for (const liveOrder of liveList) {
			if (!matchedLive.has(liveOrder.orderId)) {
				actions.push({
					type: "cancel",
					orderId: liveOrder.orderId,
					reason: "no longer desired",
				});
			}
		}
	}

	return actions;
}

function makeKey(tokenId: string, side: "buy" | "sell"): string {
	return `${tokenId}:${side}`;
}

function groupBy<T>(items: readonly T[], keyFn: (item: T) => string): Map<string, T[]> {
	const map = new Map<string, T[]>();
	for (const item of items) {
		const key = keyFn(item);
		const list = map.get(key);
		if (list) {
			list.push(item);
		} else {
			map.set(key, [item]);
		}
	}
	return map;
}

function isWithinTolerance(
	desired: DesiredOrder,
	live: LiveOrder,
	priceTolerance: Decimal | null,
	sizeTolerance: Decimal | null,
): boolean {
	return (
		isPriceWithinTolerance(desired.price, live.price, priceTolerance) &&
		isSizeWithinTolerance(desired.size, live.size, sizeTolerance)
	);
}

function isPriceWithinTolerance(
	desired: Decimal,
	live: Decimal,
	tolerance: Decimal | null,
): boolean {
	const tol = tolerance ?? Decimal.from("0.001");
	const diff = desired.sub(live).abs();
	return diff.lte(tol);
}

function isSizeWithinTolerance(
	desired: Decimal,
	live: Decimal,
	tolerance: Decimal | null,
): boolean {
	const tol = tolerance ?? Decimal.from("0.05");

	if (live.isZero()) {
		return desired.isZero();
	}

	const diff = desired.sub(live).abs();
	const fraction = diff.div(live);
	return fraction.lte(tol);
}
