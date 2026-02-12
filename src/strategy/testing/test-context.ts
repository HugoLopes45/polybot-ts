import { DetectorContext } from "../../context/detector-context.js";
import { StrategyState } from "../../lifecycle/types.js";
import type { SdkPosition } from "../../position/sdk-position.js";
import { Decimal } from "../../shared/decimal.js";
import type { ConditionId } from "../../shared/identifiers.js";
import { conditionId } from "../../shared/identifiers.js";
import type { MarketSide } from "../../shared/market-side.js";
import type { Clock } from "../../shared/time.js";

export class TestContextBuilder {
	private conditionId: ConditionId = conditionId("test-condition-123");
	private clock: Clock | undefined = undefined;
	private bestBidYes: Decimal | null = null;
	private bestAskYes: Decimal | null = null;
	private bestBidNo: Decimal | null = null;
	private bestAskNo: Decimal | null = null;
	private oraclePrice: Decimal | null = null;
	private positions: readonly SdkPosition[] = [];
	private state: StrategyState = StrategyState.Active;
	private availableBalance: Decimal = Decimal.from(1000);

	withBestBid(side: MarketSide, price: Decimal): TestContextBuilder {
		if (side === "yes") {
			this.bestBidYes = price;
		} else {
			this.bestBidNo = price;
		}
		return this;
	}

	withBestAsk(side: MarketSide, price: Decimal): TestContextBuilder {
		if (side === "yes") {
			this.bestAskYes = price;
		} else {
			this.bestAskNo = price;
		}
		return this;
	}

	withOraclePrice(price: Decimal): TestContextBuilder {
		this.oraclePrice = price;
		return this;
	}

	withPositions(positions: readonly SdkPosition[]): TestContextBuilder {
		this.positions = positions;
		return this;
	}

	withState(state: StrategyState): TestContextBuilder {
		this.state = state;
		return this;
	}

	withBalance(balance: Decimal): TestContextBuilder {
		this.availableBalance = balance;
		return this;
	}

	atTime(clock: Clock): TestContextBuilder {
		this.clock = clock;
		return this;
	}

	build(): DetectorContext {
		return DetectorContext.create({
			conditionId: this.conditionId,
			clock: this.clock,
			bestBid: null,
			bestAsk: null,
			book: {
				yes: { bid: this.bestBidYes, ask: this.bestAskYes },
				no: { bid: this.bestBidNo, ask: this.bestAskNo },
			},
			oraclePrice: this.oraclePrice,
			oracleAgeMs: null,
			timeRemainingMs: 0,
			positions: [...this.positions],
			state: this.state,
			dailyPnl: Decimal.zero(),
			consecutiveLosses: 0,
			availableBalance: this.availableBalance,
		});
	}
}
