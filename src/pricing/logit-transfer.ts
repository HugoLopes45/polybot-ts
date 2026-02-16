/**
 * Logit Transfer Model — online logistic regression mapping CEX price → market probability.
 *
 * X = ln(cexPrice), Y = logit(prob) = ln(prob/(1-prob))
 * Prediction: sigmoid(slope * ln(cexPrice) + intercept) → bounded (0,1)
 *
 * Includes ghost-book detection (constant prob readings indicate stale/fake liquidity).
 */
import { Decimal } from "../shared/decimal.js";
import { OnlineRegression } from "./online-regression.js";

const PROB_CLAMP_MIN = 0.001;
const PROB_CLAMP_MAX = 0.999;

export interface TransferConfig {
	readonly minR2?: Decimal;
	readonly minSamples?: number;
	readonly maxFlatReadings?: number;
}

export interface TransferPrediction {
	readonly predictedProb: Decimal;
	readonly r2: Decimal;
	readonly valid: boolean;
	readonly sampleCount: number;
}

function logit(p: number): number {
	return Math.log(p / (1 - p));
}

function sigmoid(z: number): number {
	return 1 / (1 + Math.exp(-z));
}

export class LogitTransferModel {
	private readonly regression: OnlineRegression;
	private readonly minR2: number;
	private readonly minSamples: number;
	private readonly maxFlatReadings: number;
	private flatCount = 0;
	private lastProb: string | null = null;

	private constructor(config: TransferConfig) {
		this.regression = OnlineRegression.create();
		this.minR2 = config.minR2?.toNumber() ?? 0.5;
		this.minSamples = config.minSamples ?? 10;
		this.maxFlatReadings = config.maxFlatReadings ?? 20;
	}

	static create(config: TransferConfig = {}): LogitTransferModel {
		return new LogitTransferModel(config);
	}

	observe(cexPrice: Decimal, marketProb: Decimal): void {
		if (!cexPrice.isPositive()) return;
		const probNum = Math.max(PROB_CLAMP_MIN, Math.min(PROB_CLAMP_MAX, marketProb.toNumber()));
		const x = Math.log(cexPrice.toNumber());
		const y = logit(probNum);

		this.regression.update(x, y);

		const probStr = marketProb.toString();
		if (this.lastProb === probStr) {
			this.flatCount++;
		} else {
			this.flatCount = 1;
			this.lastProb = probStr;
		}
	}

	predict(cexPrice: Decimal): TransferPrediction | null {
		if (!cexPrice.isPositive()) return null;
		if (this.isGhostBook()) return null;

		const stats = this.regression.stats();
		if (stats === null) return null;
		if (stats.n < this.minSamples) return null;

		const r2 = stats.r2.toNumber();
		const valid = r2 >= this.minR2;

		if (!valid) {
			return { predictedProb: Decimal.zero(), r2: stats.r2, valid: false, sampleCount: stats.n };
		}

		const x = Math.log(cexPrice.toNumber());
		const z = stats.slope.toNumber() * x + stats.intercept.toNumber();
		const prob = sigmoid(z);

		return {
			predictedProb: Decimal.from(prob),
			r2: stats.r2,
			valid: true,
			sampleCount: stats.n,
		};
	}

	isGhostBook(): boolean {
		return this.flatCount >= this.maxFlatReadings;
	}

	reset(): void {
		this.regression.reset();
		this.flatCount = 0;
		this.lastProb = null;
	}
}
