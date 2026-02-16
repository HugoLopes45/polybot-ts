/**
 * Market Scanner — composite scoring for market rotation selection.
 *
 * Evaluates markets across multiple dimensions (volume, depth, spread, freshness)
 * with configurable weights. Supports rotation threshold safety.
 */
import { Decimal } from "../shared/decimal.js";

export interface MarketScore {
	readonly marketId: string;
	readonly totalScore: Decimal;
	readonly components: {
		readonly volume: Decimal;
		readonly depth: Decimal;
		readonly spread: Decimal;
		readonly freshness: Decimal;
	};
}

export interface ScannerWeights {
	readonly volume: Decimal;
	readonly depth: Decimal;
	readonly spread: Decimal;
	readonly freshness: Decimal;
}

export interface MarketData {
	readonly marketId: string;
	readonly volume24h: Decimal;
	readonly bookDepth: Decimal;
	readonly spreadBps: Decimal;
	readonly lastUpdateMs: number;
}

export interface MarketScannerConfig {
	readonly weights: ScannerWeights;
	readonly rotationThreshold?: Decimal;
	readonly maxSpreadBps?: Decimal;
}

const DEFAULT_WEIGHTS: ScannerWeights = {
	volume: Decimal.from("0.3"),
	depth: Decimal.from("0.3"),
	spread: Decimal.from("0.25"),
	freshness: Decimal.from("0.15"),
};

export class MarketScanner {
	private readonly config: MarketScannerConfig;

	private constructor(config: MarketScannerConfig) {
		this.config = config;
	}

	static create(config?: Partial<MarketScannerConfig>): MarketScanner {
		return new MarketScanner({
			weights: config?.weights ?? DEFAULT_WEIGHTS,
			...(config?.rotationThreshold !== undefined && {
				rotationThreshold: config.rotationThreshold,
			}),
			...(config?.maxSpreadBps !== undefined && { maxSpreadBps: config.maxSpreadBps }),
		});
	}

	/**
	 * Score and rank markets.
	 * @param markets Array of market data
	 * @param nowMs Current timestamp for freshness calculation
	 * @returns Sorted array of market scores (highest first)
	 */
	scan(markets: readonly MarketData[], nowMs: number): readonly MarketScore[] {
		if (markets.length === 0) return [];

		const maxVolume = Math.max(...markets.map((m) => m.volume24h.toNumber()), 1);
		const maxDepth = Math.max(...markets.map((m) => m.bookDepth.toNumber()), 1);
		const w = this.config.weights;

		const scores: MarketScore[] = markets
			.filter((m) => {
				if (this.config.maxSpreadBps) {
					return m.spreadBps.lte(this.config.maxSpreadBps);
				}
				return true;
			})
			.map((m) => {
				const volScore = Decimal.from(m.volume24h.toNumber() / maxVolume);
				const depthScore = Decimal.from(m.bookDepth.toNumber() / maxDepth);
				// Lower spread is better: score = 1 - min(spreadBps/1000, 1)
				const spreadScore = Decimal.from(Math.max(0, 1 - m.spreadBps.toNumber() / 1000));
				// Freshness: exponential decay with 5-minute half-life
				const ageMs = nowMs - m.lastUpdateMs;
				const freshScore = Decimal.from(Math.exp(-ageMs / 300_000));

				const total = volScore
					.mul(w.volume)
					.add(depthScore.mul(w.depth))
					.add(spreadScore.mul(w.spread))
					.add(freshScore.mul(w.freshness));

				return {
					marketId: m.marketId,
					totalScore: total,
					components: {
						volume: volScore,
						depth: depthScore,
						spread: spreadScore,
						freshness: freshScore,
					},
				};
			});

		scores.sort((a, b) => b.totalScore.toNumber() - a.totalScore.toNumber());
		return scores;
	}

	/**
	 * Select top N markets, respecting rotation threshold.
	 * Only rotates from currentMarkets to new ones if score difference exceeds threshold.
	 */
	selectTop(
		scores: readonly MarketScore[],
		count: number,
		currentMarketIds?: readonly string[],
	): readonly string[] {
		if (!currentMarketIds || currentMarketIds.length === 0) {
			return scores.slice(0, count).map((s) => s.marketId);
		}

		const threshold = this.config.rotationThreshold?.toNumber() ?? 0;
		const result: string[] = [];

		for (const score of scores) {
			if (result.length >= count) break;

			const isCurrent = currentMarketIds.includes(score.marketId);
			if (isCurrent) {
				result.push(score.marketId);
				continue;
			}

			// New market: must beat worst current by threshold
			const worstCurrentScore = this.findWorstScore(scores, currentMarketIds);
			if (
				worstCurrentScore === null ||
				score.totalScore.toNumber() - worstCurrentScore > threshold
			) {
				result.push(score.marketId);
			}
		}

		return result;
	}

	private findWorstScore(
		scores: readonly MarketScore[],
		marketIds: readonly string[],
	): number | null {
		let worst: number | null = null;
		for (const score of scores) {
			if (marketIds.includes(score.marketId)) {
				const v = score.totalScore.toNumber();
				if (worst === null || v < worst) worst = v;
			}
		}
		return worst;
	}
}
