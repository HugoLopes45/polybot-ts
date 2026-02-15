import { Decimal } from "../../shared/decimal.js";
import { marketTokenId } from "../../shared/identifiers.js";
import { MarketSide } from "../../shared/market-side.js";
import { type Result, err, ok } from "../../shared/result.js";
import type { DetectorContextLike, SdkOrderIntent, SignalDetector } from "../types.js";

const HALF_PRICE = Decimal.from("0.50");

export interface DipArbConfig {
	readonly dipThresholdPct: Decimal;
	readonly windowSizeSec: number;
	readonly defaultSize?: Decimal;
}

export interface DipArbSignal {
	readonly side: MarketSide;
	readonly dipPct: Decimal;
	readonly entryPrice: Decimal;
}

interface PricePoint {
	readonly timestampMs: number;
	readonly price: Decimal;
}

export class DipArbDetector implements SignalDetector<DipArbConfig, DipArbSignal> {
	readonly name = "dip-arb";
	private readonly config: DipArbConfig;
	private priceHistory: PricePoint[] = [];
	private readonly defaultSize: Decimal;

	private constructor(config: DipArbConfig) {
		this.config = config;
		this.defaultSize = config.defaultSize ?? Decimal.from("10");
	}

	static create(config: DipArbConfig): Result<DipArbDetector, Error> {
		if (!config.dipThresholdPct.isPositive()) {
			return err(new Error("dipThresholdPct must be positive"));
		}
		if (config.windowSizeSec <= 0) {
			return err(new Error("windowSizeSec must be positive"));
		}
		return ok(new DipArbDetector(config));
	}

	setPriceHistory(history: readonly PricePoint[]): void {
		this.priceHistory = [...history];
	}

	getPriceHistory(): readonly PricePoint[] {
		return [...this.priceHistory];
	}

	detectEntry(ctx: DetectorContextLike): DipArbSignal | null {
		const currentPrice = ctx.spot();
		if (!currentPrice) {
			return null;
		}

		const now = ctx.nowMs();
		const newPricePoint = { timestampMs: now, price: currentPrice };
		this.priceHistory = [...this.priceHistory, newPricePoint];
		this.pruneOldPrices(now);

		const dipSignal = this.detectFlashCrash(now);
		if (!dipSignal) {
			return null;
		}

		const side = this.determineDipSide(dipSignal.dipPct, currentPrice);
		if (!side) {
			return null;
		}

		return {
			side,
			dipPct: dipSignal.dipPct,
			entryPrice: currentPrice,
		};
	}

	toOrder(signal: DipArbSignal, ctx: DetectorContextLike): SdkOrderIntent {
		return {
			conditionId: ctx.conditionId,
			tokenId:
				signal.side === MarketSide.Yes ? marketTokenId("yes-token") : marketTokenId("no-token"),
			side: signal.side,
			direction: "buy",
			price: signal.entryPrice,
			size: this.defaultSize,
		};
	}

	private detectFlashCrash(nowMs: number): { dipPct: Decimal } | null {
		if (this.priceHistory.length < 2) {
			return null;
		}

		const windowStartMs = nowMs - this.config.windowSizeSec * 1000;
		const relevantPrices = this.priceHistory.filter((p) => p.timestampMs >= windowStartMs);

		if (relevantPrices.length < 2) {
			return null;
		}

		const oldestPrice = relevantPrices[0]?.price;
		const latestPrice = relevantPrices[relevantPrices.length - 1]?.price;

		if (!oldestPrice || !latestPrice) {
			return null;
		}

		if (oldestPrice.isZero()) {
			return null;
		}

		if (latestPrice.gte(oldestPrice)) {
			return null;
		}

		const dropPct = oldestPrice.sub(latestPrice).div(oldestPrice);

		if (dropPct.lt(this.config.dipThresholdPct)) {
			return null;
		}

		return { dipPct: dropPct };
	}

	private determineDipSide(_dipPct: Decimal, currentPrice: Decimal): MarketSide | null {
		if (currentPrice.lt(HALF_PRICE)) {
			return MarketSide.Yes;
		}
		if (currentPrice.gt(HALF_PRICE)) {
			return MarketSide.No;
		}
		return null;
	}

	private pruneOldPrices(nowMs: number): void {
		const cutoffMs = nowMs - this.config.windowSizeSec * 1000;
		this.priceHistory = this.priceHistory.filter((p) => p.timestampMs >= cutoffMs);
	}
}
