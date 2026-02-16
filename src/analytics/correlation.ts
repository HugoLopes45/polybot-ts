/**
 * Rolling Pearson correlation engine between price series.
 *
 * Tracks correlation between two series with a rolling window,
 * and detects regime shifts when |Δcorr| exceeds a threshold.
 */
import { Decimal } from "../shared/decimal.js";

export interface CorrelationConfig {
	readonly windowSize: number;
	readonly regimeShiftThreshold?: Decimal;
}

export interface CorrelationResult {
	readonly correlation: Decimal;
	readonly regimeShift: boolean;
	readonly prevCorrelation: Decimal | null;
	readonly sampleCount: number;
}

export class CorrelationEngine {
	private readonly windowSize: number;
	private readonly threshold: number;
	private readonly xBuffer: number[] = [];
	private readonly yBuffer: number[] = [];
	private prevCorr: number | null = null;

	private constructor(config: CorrelationConfig) {
		this.windowSize = config.windowSize;
		this.threshold = config.regimeShiftThreshold?.toNumber() ?? 0.3;
	}

	static create(config: CorrelationConfig): CorrelationEngine {
		return new CorrelationEngine(config);
	}

	update(x: Decimal, y: Decimal): CorrelationResult | null {
		this.xBuffer.push(x.toNumber());
		this.yBuffer.push(y.toNumber());

		if (this.xBuffer.length > this.windowSize) {
			this.xBuffer.shift();
			this.yBuffer.shift();
		}

		if (this.xBuffer.length < 2) return null;

		const corr = this.pearson();
		const prevCorrDec = this.prevCorr !== null ? Decimal.from(this.prevCorr) : null;
		const shift = this.prevCorr !== null && Math.abs(corr - this.prevCorr) >= this.threshold;

		const result: CorrelationResult = {
			correlation: Decimal.from(corr),
			regimeShift: shift,
			prevCorrelation: prevCorrDec,
			sampleCount: this.xBuffer.length,
		};

		this.prevCorr = corr;
		return result;
	}

	reset(): void {
		this.xBuffer.length = 0;
		this.yBuffer.length = 0;
		this.prevCorr = null;
	}

	private pearson(): number {
		const n = this.xBuffer.length;
		let sumX = 0;
		let sumY = 0;
		let sumXY = 0;
		let sumXX = 0;
		let sumYY = 0;

		for (let i = 0; i < n; i++) {
			const xi = this.xBuffer[i] ?? 0;
			const yi = this.yBuffer[i] ?? 0;
			sumX += xi;
			sumY += yi;
			sumXY += xi * yi;
			sumXX += xi * xi;
			sumYY += yi * yi;
		}

		const denomX = n * sumXX - sumX * sumX;
		const denomY = n * sumYY - sumY * sumY;
		const denom = Math.sqrt(denomX * denomY);

		if (denom < 1e-15) return 0;
		return (n * sumXY - sumX * sumY) / denom;
	}
}
