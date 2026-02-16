/**
 * Slippage & commission models for realistic backtest simulation.
 */
import { Decimal } from "../shared/decimal.js";

/** Transforms an intended fill price into an effective price after slippage. */
export interface SlippageModel {
	readonly name: string;
	apply(intendedPrice: Decimal, size: Decimal, isBuy: boolean): Decimal;
}

/** Fixed basis-point slippage (e.g., 5bps = 0.05%). */
export class FixedBpsSlippage implements SlippageModel {
	readonly name = "FixedBps";
	private readonly bps: Decimal;

	private constructor(bps: Decimal) {
		this.bps = bps;
	}

	static create(bps: number): FixedBpsSlippage {
		return new FixedBpsSlippage(Decimal.from(bps));
	}

	apply(intendedPrice: Decimal, _size: Decimal, isBuy: boolean): Decimal {
		const slip = intendedPrice.mul(this.bps).div(Decimal.from(10000));
		return isBuy ? intendedPrice.add(slip) : intendedPrice.sub(slip);
	}
}

/** Size-proportional slippage: larger orders get worse fills. */
export class SizeProportionalSlippage implements SlippageModel {
	readonly name = "SizeProportional";
	private readonly coeffBps: Decimal;
	private readonly adv: Decimal;

	private constructor(coeffBps: Decimal, adv: Decimal) {
		this.coeffBps = coeffBps;
		this.adv = adv;
	}

	/** @param coeffBps Basis points per unit of size/ADV ratio. @param adv Average daily volume. */
	static create(coeffBps: number, adv: number): SizeProportionalSlippage {
		return new SizeProportionalSlippage(Decimal.from(coeffBps), Decimal.from(adv));
	}

	apply(intendedPrice: Decimal, size: Decimal, isBuy: boolean): Decimal {
		if (this.adv.isZero()) return intendedPrice;
		const ratio = size.div(this.adv);
		const bps = this.coeffBps.mul(ratio);
		const slip = intendedPrice.mul(bps).div(Decimal.from(10000));
		return isBuy ? intendedPrice.add(slip) : intendedPrice.sub(slip);
	}
}

/** Commission model: flat fee per order or percentage of notional. */
export class CommissionModel {
	readonly name = "Commission";
	private readonly flatFee: Decimal;
	private readonly pctFee: Decimal;

	private constructor(flatFee: Decimal, pctFee: Decimal) {
		this.flatFee = flatFee;
		this.pctFee = pctFee;
	}

	static flat(fee: number): CommissionModel {
		return new CommissionModel(Decimal.from(fee), Decimal.zero());
	}

	static percentage(pct: number): CommissionModel {
		return new CommissionModel(Decimal.zero(), Decimal.from(pct / 100));
	}

	static combined(flatFee: number, pctFee: number): CommissionModel {
		return new CommissionModel(Decimal.from(flatFee), Decimal.from(pctFee / 100));
	}

	/** Calculate commission for a trade. */
	calc(notional: Decimal): Decimal {
		return this.flatFee.add(notional.mul(this.pctFee));
	}
}
