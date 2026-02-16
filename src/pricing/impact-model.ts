import { Decimal } from "../shared/decimal.js";

export interface ImpactConfig {
	readonly eta: Decimal;
	readonly gamma: Decimal;
}

export interface ImpactInput {
	readonly orderSize: Decimal;
	readonly adv: Decimal;
	readonly volatility: Decimal;
	readonly price: Decimal;
}

export interface ImpactEstimate {
	readonly temporaryImpact: Decimal;
	readonly permanentImpact: Decimal;
	readonly totalImpact: Decimal;
	readonly totalImpactPct: Decimal;
	readonly effectivePrice: Decimal;
}

const DEFAULT_CONFIG: ImpactConfig = {
	eta: Decimal.from("0.1"),
	gamma: Decimal.from("0.1"),
};

export function estimateImpact(input: ImpactInput, config?: ImpactConfig): ImpactEstimate {
	const cfg = config ?? DEFAULT_CONFIG;

	if (input.orderSize.isZero() || input.adv.isZero() || input.price.isZero()) {
		return {
			temporaryImpact: Decimal.zero(),
			permanentImpact: Decimal.zero(),
			totalImpact: Decimal.zero(),
			totalImpactPct: Decimal.zero(),
			effectivePrice: input.price,
		};
	}

	const qOverAdv = input.orderSize.div(input.adv);
	const sqrtQOverAdv = qOverAdv.sqrt();

	const temporaryImpact = cfg.eta.mul(input.volatility).mul(sqrtQOverAdv);
	const permanentImpact = cfg.gamma.mul(input.volatility).mul(qOverAdv);
	const totalImpact = temporaryImpact.add(permanentImpact);

	const totalImpactPct = totalImpact.div(input.price);
	const effectivePrice = input.price.mul(Decimal.one().add(totalImpactPct));

	return {
		temporaryImpact,
		permanentImpact,
		totalImpact,
		totalImpactPct,
		effectivePrice,
	};
}

export function optimalSize(
	maxSlippagePct: Decimal,
	adv: Decimal,
	volatility: Decimal,
	config?: ImpactConfig,
): Decimal {
	const cfg = config ?? DEFAULT_CONFIG;

	if (maxSlippagePct.isZero()) {
		return Decimal.zero();
	}

	if (volatility.isZero()) {
		return adv;
	}

	const a = cfg.gamma.mul(volatility);
	const b = cfg.eta.mul(volatility);

	const discriminant = b.pow(2).add(Decimal.from("4").mul(a).mul(maxSlippagePct));
	const sqrtDiscriminant = discriminant.sqrt();
	const twoA = Decimal.from("2").mul(a);

	const x = b.neg().add(sqrtDiscriminant).div(twoA);

	const qOverAdv = x.pow(2);
	const q = qOverAdv.mul(adv);

	return Decimal.max(Decimal.zero(), q);
}
