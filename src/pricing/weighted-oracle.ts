import { Decimal } from "../shared/decimal.js";
/**
 * WeightedOracle — multi-exchange price aggregation with staleness decay and outlier detection.
 *
 * Combines prices from multiple sources using configurable weights, linear staleness decay,
 * cross-source consistency gating, and median-based outlier rejection.
 */
import type { Clock } from "../shared/time.js";

export interface OracleSourceConfig {
	readonly name: string;
	readonly weight: Decimal;
	readonly maxAgeMs: number;
}

export interface PriceUpdate {
	readonly source: string;
	readonly price: Decimal;
	readonly timestampMs: number;
}

export interface AggregatedPrice {
	readonly price: Decimal;
	readonly activeSources: number;
	readonly totalWeight: Decimal;
	readonly reliable: boolean;
}

export interface WeightedOracleConfig {
	readonly sources: readonly OracleSourceConfig[];
	readonly maxDivergence: Decimal;
	readonly minActiveSources?: number;
}

interface SourceState {
	readonly price: Decimal;
	readonly timestampMs: number;
}

export class WeightedOracle {
	private readonly config: WeightedOracleConfig;
	private readonly clock: Clock;
	private readonly state = new Map<string, SourceState>();
	private readonly sourceConfigs = new Map<string, OracleSourceConfig>();

	private constructor(config: WeightedOracleConfig, clock: Clock) {
		this.config = config;
		this.clock = clock;
		for (const src of config.sources) {
			this.sourceConfigs.set(src.name, src);
		}
	}

	static create(config: WeightedOracleConfig, clock: Clock): WeightedOracle {
		return new WeightedOracle(config, clock);
	}

	update(priceUpdate: PriceUpdate): void {
		if (!this.sourceConfigs.has(priceUpdate.source)) return;
		this.state.set(priceUpdate.source, {
			price: priceUpdate.price,
			timestampMs: priceUpdate.timestampMs,
		});
	}

	aggregate(): AggregatedPrice | null {
		const now = this.clock.now();
		const active = this.getActiveSources(now);
		if (active.length === 0) return null;

		const filtered = this.filterOutliers(active);
		if (filtered.length === 0) return null;

		if (!this.checkConsistency(filtered)) return null;

		let weightedSum = Decimal.zero();
		let totalWeight = Decimal.zero();

		for (const s of filtered) {
			weightedSum = weightedSum.add(s.price.mul(s.effectiveWeight));
			totalWeight = totalWeight.add(s.effectiveWeight);
		}

		if (totalWeight.isZero()) return null;

		const minActive = this.config.minActiveSources ?? 1;
		return {
			price: weightedSum.div(totalWeight),
			activeSources: filtered.length,
			totalWeight,
			reliable: filtered.length >= minActive,
		};
	}

	getSourceStatus(): Array<{
		name: string;
		stale: boolean;
		ageMs: number;
		price: Decimal | null;
	}> {
		const now = this.clock.now();
		return this.config.sources.map((src) => {
			const s = this.state.get(src.name);
			if (!s) {
				return { name: src.name, stale: true, ageMs: -1, price: null };
			}
			const age = now - s.timestampMs;
			return {
				name: src.name,
				stale: age >= src.maxAgeMs,
				ageMs: age,
				price: s.price,
			};
		});
	}

	private getActiveSources(
		now: number,
	): Array<{ name: string; price: Decimal; effectiveWeight: Decimal }> {
		const result: Array<{ name: string; price: Decimal; effectiveWeight: Decimal }> = [];

		for (const src of this.config.sources) {
			const s = this.state.get(src.name);
			if (!s) continue;

			const age = now - s.timestampMs;
			if (age >= src.maxAgeMs) continue;

			const decay = Decimal.from(1 - age / src.maxAgeMs);
			result.push({
				name: src.name,
				price: s.price,
				effectiveWeight: src.weight.mul(decay),
			});
		}

		return result;
	}

	private filterOutliers(
		sources: Array<{ name: string; price: Decimal; effectiveWeight: Decimal }>,
	): Array<{ name: string; price: Decimal; effectiveWeight: Decimal }> {
		if (sources.length < 3) return sources;

		const prices = sources.map((s) => s.price.toNumber()).sort((a, b) => a - b);
		const mid = Math.floor(prices.length / 2);
		const median =
			prices.length % 2 === 0
				? ((prices[mid - 1] ?? 0) + (prices[mid] ?? 0)) / 2
				: (prices[mid] ?? 0);

		const threshold = this.config.maxDivergence.toNumber();
		return sources.filter((s) => {
			if (median === 0) return true;
			const div = Math.abs(s.price.toNumber() - median) / median;
			return div <= threshold;
		});
	}

	private checkConsistency(
		sources: Array<{ name: string; price: Decimal; effectiveWeight: Decimal }>,
	): boolean {
		if (sources.length < 2) return true;

		const threshold = this.config.maxDivergence.toNumber();
		for (let i = 0; i < sources.length; i++) {
			const srcA = sources[i];
			if (!srcA) continue;
			for (let j = i + 1; j < sources.length; j++) {
				const srcB = sources[j];
				if (!srcB) continue;
				const a = srcA.price.toNumber();
				const b = srcB.price.toNumber();
				const avg = (a + b) / 2;
				if (avg === 0) continue;
				const div = Math.abs(a - b) / avg;
				if (div > threshold) return false;
			}
		}
		return true;
	}
}
