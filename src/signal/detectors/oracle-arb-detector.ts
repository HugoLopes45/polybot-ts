/**
 * Oracle Arbitrage Detector — signals when external oracle price diverges from CLOB.
 *
 * Compares an external oracle provider's price with the Polymarket CLOB spot price.
 * Emits entry signal on significant divergence.
 */
import type { Decimal } from "../../shared/decimal.js";
import type { MarketTokenId } from "../../shared/identifiers.js";
import type { MarketSide } from "../../shared/market-side.js";
import type { DetectorContextLike, SdkOrderIntent, SignalDetector } from "../types.js";
import { OrderDirection } from "../types.js";

export interface OracleArbConfig {
	readonly minDivergencePct: Decimal;
	readonly maxDivergencePct?: Decimal;
	readonly orderSize: Decimal;
	readonly side: MarketSide;
	readonly tokenId: MarketTokenId;
}

export interface OracleArbSignal {
	readonly divergence: Decimal;
	readonly oraclePrice: Decimal;
	readonly spotPrice: Decimal;
	readonly direction: "buy" | "sell";
}

export class OracleArbDetector implements SignalDetector<OracleArbConfig, OracleArbSignal> {
	readonly name = "OracleArb";
	private readonly config: OracleArbConfig;
	private readonly getOraclePrice: () => Decimal | null;

	private constructor(config: OracleArbConfig, getOraclePrice: () => Decimal | null) {
		this.config = config;
		this.getOraclePrice = getOraclePrice;
	}

	static create(config: OracleArbConfig, getOraclePrice: () => Decimal | null): OracleArbDetector {
		return new OracleArbDetector(config, getOraclePrice);
	}

	detectEntry(ctx: DetectorContextLike): OracleArbSignal | null {
		const oraclePrice = this.getOraclePrice();
		if (oraclePrice === null) return null;

		const spot = ctx.spot();
		if (spot === null) return null;
		if (spot.isZero()) return null;

		const divergence = oraclePrice.sub(spot).div(spot);
		const absDivergence = divergence.abs();

		if (absDivergence.lt(this.config.minDivergencePct)) return null;

		const maxDiv = this.config.maxDivergencePct;
		if (maxDiv && absDivergence.gt(maxDiv)) return null;

		return {
			divergence,
			oraclePrice,
			spotPrice: spot,
			direction: divergence.isPositive() ? "buy" : "sell",
		};
	}

	toOrder(signal: OracleArbSignal, ctx: DetectorContextLike): SdkOrderIntent {
		const price =
			signal.direction === "buy"
				? (ctx.bestAsk(this.config.side) ?? signal.spotPrice)
				: (ctx.bestBid(this.config.side) ?? signal.spotPrice);

		return {
			conditionId: ctx.conditionId,
			tokenId: this.config.tokenId,
			side: this.config.side,
			direction: signal.direction === "buy" ? OrderDirection.Buy : OrderDirection.Sell,
			price,
			size: this.config.orderSize,
		};
	}
}
