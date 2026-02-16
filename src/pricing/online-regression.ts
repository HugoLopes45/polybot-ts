/**
 * Online linear regression with O(1) updates via running sums.
 *
 * Uses standard OLS formulas incrementally — no matrix operations needed.
 * Suitable for streaming data (e.g., real-time price/probability pairs).
 */
import { Decimal } from "../shared/decimal.js";

export interface RegressionStats {
	readonly slope: Decimal;
	readonly intercept: Decimal;
	readonly r2: Decimal;
	readonly n: number;
}

export class OnlineRegression {
	private _n = 0;
	private _sumX = 0;
	private _sumY = 0;
	private _sumXX = 0;
	private _sumXY = 0;
	private _sumYY = 0;

	private constructor() {}

	static create(): OnlineRegression {
		return new OnlineRegression();
	}

	update(x: number, y: number): void {
		this._n++;
		this._sumX += x;
		this._sumY += y;
		this._sumXX += x * x;
		this._sumXY += x * y;
		this._sumYY += y * y;
	}

	stats(): RegressionStats | null {
		if (this._n < 2) return null;

		const n = this._n;
		const denomX = n * this._sumXX - this._sumX * this._sumX;

		let slope: number;
		let intercept: number;
		let r2: number;

		if (Math.abs(denomX) < 1e-15) {
			slope = 0;
			intercept = this._sumY / n;
			r2 = 0;
		} else {
			const numerator = n * this._sumXY - this._sumX * this._sumY;
			slope = numerator / denomX;
			intercept = (this._sumY - slope * this._sumX) / n;

			const denomY = n * this._sumYY - this._sumY * this._sumY;
			if (Math.abs(denomY) < 1e-15) {
				r2 = 0;
			} else {
				r2 = (numerator * numerator) / (denomX * denomY);
			}
		}

		return {
			slope: Decimal.from(slope),
			intercept: Decimal.from(intercept),
			r2: Decimal.from(Math.max(0, Math.min(1, r2))),
			n,
		};
	}

	predict(x: number): Decimal | null {
		const s = this.stats();
		if (s === null) return null;
		return s.intercept.add(s.slope.mul(Decimal.from(x)));
	}

	get count(): number {
		return this._n;
	}

	reset(): void {
		this._n = 0;
		this._sumX = 0;
		this._sumY = 0;
		this._sumXX = 0;
		this._sumXY = 0;
		this._sumYY = 0;
	}
}
