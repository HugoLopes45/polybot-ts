import { describe, expect, it } from "vitest";
import { Decimal } from "../../shared/decimal.js";
import { conditionId } from "../../shared/identifiers.js";
import type { GuardContext } from "../types.js";
import { BalanceGuard } from "./balance.js";
import { BookStalenessGuard } from "./book-staleness.js";
import { CircuitBreakerGuard } from "./circuit-breaker.js";
import { CooldownGuard } from "./cooldown.js";
import { DuplicateOrderGuard } from "./duplicate-order.js";
import { ExposureGuard } from "./exposure.js";
import { KillSwitchGuard, KillSwitchMode } from "./kill-switch.js";
import { MaxPositionsGuard } from "./max-positions.js";
import { MaxSpreadGuard } from "./max-spread.js";
import { MinEdgeGuard } from "./min-edge.js";
import { PerMarketLimitGuard } from "./per-market-limit.js";
import { PortfolioRiskGuard } from "./portfolio-risk.js";
import { RateLimitGuard } from "./rate-limit.js";
import { ToxicityGuard } from "./toxicity.js";
import { UsdcRejectionGuard } from "./usdc-rejection.js";

// ── Helper ──────────────────────────────────────────────────────────

function makeCtx(
	overrides: Partial<{
		cid: string;
		nowMs: number;
		spreadPct: number | null;
		openPositions: number;
		dailyPnl: string;
		balance: string;
		exposure: string;
		consecutiveLosses: number;
		lastTradeMs: number | null;
		hasPendingOrder: boolean;
		oraclePrice: string | null;
		bestAsk: string;
		bookAgeMs: number | null;
	}> = {},
): GuardContext {
	return {
		conditionId: conditionId(overrides.cid ?? "cond-1"),
		nowMs: () => overrides.nowMs ?? 10_000,
		spot: () => Decimal.from("0.55"),
		oraclePrice: () =>
			overrides.oraclePrice !== undefined
				? overrides.oraclePrice === null
					? null
					: Decimal.from(overrides.oraclePrice)
				: Decimal.from("0.55"),
		bestBid: () => Decimal.from("0.54"),
		bestAsk: () => Decimal.from(overrides.bestAsk ?? "0.56"),
		spread: () => Decimal.from("0.02"),
		spreadPct: () => overrides.spreadPct ?? 3.6,
		timeRemainingMs: () => 300_000,
		openPositionCount: () => overrides.openPositions ?? 2,
		totalExposure: () => Decimal.from(overrides.exposure ?? "200"),
		availableBalance: () => Decimal.from(overrides.balance ?? "1000"),
		dailyPnl: () => Decimal.from(overrides.dailyPnl ?? "-10"),
		consecutiveLosses: () => overrides.consecutiveLosses ?? 1,
		hasPendingOrderFor: () => overrides.hasPendingOrder ?? false,
		lastTradeTimeMs: () => (overrides.lastTradeMs !== undefined ? overrides.lastTradeMs : null),
		oracleAgeMs: () => 500,
		bookAgeMs: () => (overrides.bookAgeMs !== undefined ? overrides.bookAgeMs : 200),
	};
}

// ── CooldownGuard ───────────────────────────────────────────────────

describe("CooldownGuard", () => {
	it("allows when no previous trade", () => {
		const guard = CooldownGuard.fromSecs(60);
		const ctx = makeCtx({ lastTradeMs: null });
		expect(guard.check(ctx).type).toBe("allow");
	});

	it("blocks during cooldown period", () => {
		const guard = CooldownGuard.fromSecs(60);
		const ctx = makeCtx({ nowMs: 50_000, lastTradeMs: 30_000 });
		const result = guard.check(ctx);
		expect(result.type).toBe("block");
		if (result.type === "block") {
			expect(result.guard).toBe("Cooldown");
			expect(result.currentValue).toBe(20);
			expect(result.threshold).toBe(60);
		}
	});

	it("allows after cooldown expires", () => {
		const guard = CooldownGuard.fromSecs(60);
		const ctx = makeCtx({ nowMs: 100_000, lastTradeMs: 30_000 });
		expect(guard.check(ctx).type).toBe("allow");
	});

	it("factory presets create valid instances", () => {
		expect(CooldownGuard.short().name).toBe("Cooldown");
		expect(CooldownGuard.normal().name).toBe("Cooldown");
		expect(CooldownGuard.long().name).toBe("Cooldown");
	});
});

// ── KillSwitchGuard ─────────────────────────────────────────────────

describe("KillSwitchGuard", () => {
	it("allows by default", () => {
		const guard = KillSwitchGuard.create();
		const ctx = makeCtx();
		expect(guard.check(ctx).type).toBe("allow");
	});

	it("blocks when manually engaged", () => {
		const guard = KillSwitchGuard.create();
		guard.engage("test reason");
		expect(guard.isEngaged()).toBe(true);
		const result = guard.check(makeCtx());
		expect(result.type).toBe("block");
		if (result.type === "block") {
			expect(result.recoverable).toBe(false);
		}
	});

	it("allows after disengage", () => {
		const guard = KillSwitchGuard.create();
		guard.engage();
		guard.disengage();
		expect(guard.isEngaged()).toBe(false);
		expect(guard.check(makeCtx()).type).toBe("allow");
	});

	it("auto-engages on hard threshold breach", () => {
		const guard = KillSwitchGuard.create(3, 5);
		const ctx = makeCtx({ dailyPnl: "-60", balance: "1000" });
		const result = guard.check(ctx);
		expect(result.type).toBe("block");
		expect(guard.isEngaged()).toBe(true);
		expect(guard.currentMode()).toBe(KillSwitchMode.Full);
	});

	it("auto-engages exits-only on soft threshold breach", () => {
		const guard = KillSwitchGuard.create(3, 5);
		const ctx = makeCtx({ dailyPnl: "-35", balance: "1000" });
		const result = guard.check(ctx);
		expect(result.type).toBe("block");
		expect(guard.currentMode()).toBe(KillSwitchMode.ExitsOnly);
	});

	it("is safety critical", () => {
		expect(KillSwitchGuard.create().isSafetyCritical).toBe(true);
	});
});

// ── CircuitBreakerGuard ─────────────────────────────────────────────

describe("CircuitBreakerGuard", () => {
	it("allows when within limits", () => {
		const guard = CircuitBreakerGuard.create(Decimal.from("100"), 0.2);
		const ctx = makeCtx({ dailyPnl: "-10", consecutiveLosses: 1 });
		expect(guard.check(ctx).type).toBe("allow");
	});

	it("trips on daily loss limit", () => {
		const guard = CircuitBreakerGuard.create(Decimal.from("50"), 0.2);
		const ctx = makeCtx({ dailyPnl: "-60" });
		const result = guard.check(ctx);
		expect(result.type).toBe("block");
		expect(guard.isTripped()).toBe(true);
	});

	it("trips on consecutive losses", () => {
		const guard = CircuitBreakerGuard.create(Decimal.from("1000"), 0.2);
		const ctx = makeCtx({ consecutiveLosses: 5 });
		const result = guard.check(ctx);
		expect(result.type).toBe("block");
		expect(guard.isTripped()).toBe(true);
	});

	it("stays tripped during cooldown", () => {
		const guard = CircuitBreakerGuard.withCooldown(Decimal.from("50"), 0.2, 60_000);
		guard.check(makeCtx({ dailyPnl: "-60", nowMs: 10_000 }));
		expect(guard.isTripped()).toBe(true);

		const result = guard.check(makeCtx({ dailyPnl: "0", nowMs: 30_000 }));
		expect(result.type).toBe("block");
	});

	it("resets after cooldown expires", () => {
		const guard = CircuitBreakerGuard.withCooldown(Decimal.from("50"), 0.2, 60_000);
		guard.check(makeCtx({ dailyPnl: "-60", nowMs: 10_000 }));

		const result = guard.check(makeCtx({ dailyPnl: "0", nowMs: 80_000 }));
		expect(result.type).toBe("allow");
		expect(guard.isTripped()).toBe(false);
	});

	it("can be manually reset", () => {
		const guard = CircuitBreakerGuard.create(Decimal.from("50"), 0.2);
		guard.check(makeCtx({ dailyPnl: "-60" }));
		expect(guard.isTripped()).toBe(true);
		guard.reset();
		expect(guard.isTripped()).toBe(false);
	});

	it("is safety critical", () => {
		expect(CircuitBreakerGuard.create(Decimal.from("100"), 0.2).isSafetyCritical).toBe(true);
	});
});

// ── MaxSpreadGuard ──────────────────────────────────────────────────

describe("MaxSpreadGuard", () => {
	it("allows when spread within limit", () => {
		const guard = MaxSpreadGuard.fromPct(5);
		const ctx = makeCtx({ spreadPct: 3 });
		expect(guard.check(ctx).type).toBe("allow");
	});

	it("blocks when spread exceeds limit", () => {
		const guard = MaxSpreadGuard.fromPct(5);
		const ctx = makeCtx({ spreadPct: 7 });
		const result = guard.check(ctx);
		expect(result.type).toBe("block");
		if (result.type === "block") {
			expect(result.guard).toBe("MaxSpread");
			expect(result.currentValue).toBe(7);
			expect(result.threshold).toBe(5);
		}
	});

	it("allows when spread unavailable", () => {
		const guard = MaxSpreadGuard.normal();
		const ctx = makeCtx({ spreadPct: null });
		expect(guard.check(ctx).type).toBe("allow");
	});

	it("factory presets create valid instances", () => {
		expect(MaxSpreadGuard.tight().name).toBe("MaxSpread");
		expect(MaxSpreadGuard.normal().name).toBe("MaxSpread");
		expect(MaxSpreadGuard.wide().name).toBe("MaxSpread");
	});
});

// ── MaxPositionsGuard ───────────────────────────────────────────────

describe("MaxPositionsGuard", () => {
	it("allows when below limit", () => {
		const guard = MaxPositionsGuard.create(5);
		const ctx = makeCtx({ openPositions: 3 });
		expect(guard.check(ctx).type).toBe("allow");
	});

	it("blocks when at limit", () => {
		const guard = MaxPositionsGuard.create(5);
		const ctx = makeCtx({ openPositions: 5 });
		const result = guard.check(ctx);
		expect(result.type).toBe("block");
		if (result.type === "block") {
			expect(result.currentValue).toBe(5);
			expect(result.threshold).toBe(5);
		}
	});

	it("blocks when over limit", () => {
		const guard = MaxPositionsGuard.create(3);
		expect(guard.check(makeCtx({ openPositions: 5 })).type).toBe("block");
	});
});

// ── DuplicateOrderGuard ────────────────────────────────────────────

describe("DuplicateOrderGuard", () => {
	it("allows when no pending orders", () => {
		const guard = new DuplicateOrderGuard();
		expect(guard.check(makeCtx()).type).toBe("allow");
	});

	it("blocks when pending order exists", () => {
		const guard = new DuplicateOrderGuard();
		const result = guard.check(makeCtx({ hasPendingOrder: true }));
		expect(result.type).toBe("block");
		if (result.type === "block") {
			expect(result.guard).toBe("DuplicateOrder");
		}
	});
});

// ── BookStalenessGuard ─────────────────────────────────────────────

describe("BookStalenessGuard", () => {
	it("allows when book is fresh", () => {
		const guard = BookStalenessGuard.fromSecs(5);
		const ctx = makeCtx({ bookAgeMs: 2000 });
		expect(guard.check(ctx).type).toBe("allow");
	});

	it("blocks when book is stale", () => {
		const guard = BookStalenessGuard.fromSecs(5);
		const ctx = makeCtx({ bookAgeMs: 8000 });
		const result = guard.check(ctx);
		expect(result.type).toBe("block");
		if (result.type === "block") {
			expect(result.guard).toBe("BookStaleness");
		}
	});

	it("allows when book age is null", () => {
		const guard = BookStalenessGuard.fromSecs(5);
		const ctx = makeCtx({ bookAgeMs: null });
		expect(guard.check(ctx).type).toBe("allow");
	});
});

// ── ExposureGuard ──────────────────────────────────────────────────

describe("ExposureGuard", () => {
	it("allows when exposure below limit", () => {
		const guard = ExposureGuard.fromPct(50);
		const ctx = makeCtx({ exposure: "200", balance: "1000" });
		expect(guard.check(ctx).type).toBe("allow");
	});

	it("blocks when exposure exceeds limit", () => {
		const guard = ExposureGuard.fromPct(25);
		const ctx = makeCtx({ exposure: "300", balance: "1000" });
		const result = guard.check(ctx);
		expect(result.type).toBe("block");
		if (result.type === "block") {
			expect(result.guard).toBe("Exposure");
		}
	});

	it("allows when balance is zero", () => {
		const guard = ExposureGuard.fromPct(50);
		const ctx = makeCtx({ exposure: "200", balance: "0" });
		expect(guard.check(ctx).type).toBe("allow");
	});
});

// ── BalanceGuard ───────────────────────────────────────────────────

describe("BalanceGuard", () => {
	it("allows when balance above minimum", () => {
		const guard = BalanceGuard.create(Decimal.from("100"));
		const ctx = makeCtx({ balance: "500" });
		expect(guard.check(ctx).type).toBe("allow");
	});

	it("blocks when balance below minimum", () => {
		const guard = BalanceGuard.create(Decimal.from("100"));
		const ctx = makeCtx({ balance: "50" });
		const result = guard.check(ctx);
		expect(result.type).toBe("block");
		if (result.type === "block") {
			expect(result.guard).toBe("Balance");
			expect(result.currentValue).toBe(50);
			expect(result.threshold).toBe(100);
		}
	});
});

// ── PortfolioRiskGuard ─────────────────────────────────────────────

describe("PortfolioRiskGuard", () => {
	it("allows when P&L is positive", () => {
		const guard = PortfolioRiskGuard.fromPct(10);
		const ctx = makeCtx({ dailyPnl: "50", balance: "1000" });
		expect(guard.check(ctx).type).toBe("allow");
	});

	it("allows when drawdown below limit", () => {
		const guard = PortfolioRiskGuard.fromPct(10);
		const ctx = makeCtx({ dailyPnl: "-50", balance: "1000" });
		expect(guard.check(ctx).type).toBe("allow");
	});

	it("blocks when drawdown exceeds limit", () => {
		const guard = PortfolioRiskGuard.fromPct(5);
		const ctx = makeCtx({ dailyPnl: "-60", balance: "1000" });
		const result = guard.check(ctx);
		expect(result.type).toBe("block");
		if (result.type === "block") {
			expect(result.guard).toBe("PortfolioRisk");
		}
	});
});

// ── ToxicityGuard ──────────────────────────────────────────────────

describe("ToxicityGuard", () => {
	it("allows non-toxic markets", () => {
		const guard = ToxicityGuard.create();
		expect(guard.check(makeCtx()).type).toBe("allow");
	});

	it("blocks toxic markets", () => {
		const guard = ToxicityGuard.create();
		guard.markToxic("cond-1");
		const result = guard.check(makeCtx());
		expect(result.type).toBe("block");
		if (result.type === "block") {
			expect(result.guard).toBe("Toxicity");
		}
	});

	it("allows after unmark", () => {
		const guard = ToxicityGuard.create();
		guard.markToxic("cond-1");
		guard.unmarkToxic("cond-1");
		expect(guard.check(makeCtx()).type).toBe("allow");
	});

	it("isToxic reports correctly", () => {
		const guard = ToxicityGuard.create();
		expect(guard.isToxic("cond-1")).toBe(false);
		guard.markToxic("cond-1");
		expect(guard.isToxic("cond-1")).toBe(true);
	});
});

// ── RateLimitGuard ─────────────────────────────────────────────────

describe("RateLimitGuard", () => {
	it("allows when under limit", () => {
		const guard = RateLimitGuard.perMinute(3);
		guard.recordOrder(5_000);
		const ctx = makeCtx({ nowMs: 10_000 });
		expect(guard.check(ctx).type).toBe("allow");
	});

	it("blocks when at limit", () => {
		const guard = RateLimitGuard.perMinute(2);
		guard.recordOrder(5_000);
		guard.recordOrder(8_000);
		const ctx = makeCtx({ nowMs: 10_000 });
		const result = guard.check(ctx);
		expect(result.type).toBe("block");
		if (result.type === "block") {
			expect(result.currentValue).toBe(2);
			expect(result.threshold).toBe(2);
		}
	});

	it("allows after old orders expire from window", () => {
		const guard = RateLimitGuard.create(2, 10_000);
		guard.recordOrder(1_000);
		guard.recordOrder(2_000);
		const ctx = makeCtx({ nowMs: 15_000 });
		expect(guard.check(ctx).type).toBe("allow");
	});
});

// ── MinEdgeGuard ───────────────────────────────────────────────────

describe("MinEdgeGuard", () => {
	it("allows when edge exceeds minimum", () => {
		const guard = MinEdgeGuard.fromPct(1);
		const ctx = makeCtx({ oraclePrice: "0.60", bestAsk: "0.56" });
		expect(guard.check(ctx).type).toBe("allow");
	});

	it("blocks when edge below minimum", () => {
		const guard = MinEdgeGuard.fromPct(5);
		const ctx = makeCtx({ oraclePrice: "0.57", bestAsk: "0.56" });
		const result = guard.check(ctx);
		expect(result.type).toBe("block");
		if (result.type === "block") {
			expect(result.guard).toBe("MinEdge");
		}
	});

	it("allows when oracle unavailable", () => {
		const guard = MinEdgeGuard.fromPct(1);
		const ctx = makeCtx({ oraclePrice: null });
		expect(guard.check(ctx).type).toBe("allow");
	});
});

// ── PerMarketLimitGuard ────────────────────────────────────────────

describe("PerMarketLimitGuard", () => {
	it("allows when under limit", () => {
		const guard = PerMarketLimitGuard.create(3);
		guard.recordOrder("cond-1");
		expect(guard.check(makeCtx()).type).toBe("allow");
	});

	it("blocks when at limit", () => {
		const guard = PerMarketLimitGuard.create(2);
		guard.recordOrder("cond-1");
		guard.recordOrder("cond-1");
		const result = guard.check(makeCtx());
		expect(result.type).toBe("block");
		if (result.type === "block") {
			expect(result.guard).toBe("PerMarketLimit");
		}
	});

	it("allows after reset", () => {
		const guard = PerMarketLimitGuard.create(2);
		guard.recordOrder("cond-1");
		guard.recordOrder("cond-1");
		guard.resetMarket("cond-1");
		expect(guard.check(makeCtx()).type).toBe("allow");
	});

	it("tracks per-market independently", () => {
		const guard = PerMarketLimitGuard.create(1);
		guard.recordOrder("cond-1");
		expect(guard.check(makeCtx({ cid: "cond-2" })).type).toBe("allow");
	});
});

// ── UsdcRejectionGuard ─────────────────────────────────────────────

describe("UsdcRejectionGuard", () => {
	it("allows normal condition IDs", () => {
		const guard = new UsdcRejectionGuard();
		expect(guard.check(makeCtx()).type).toBe("allow");
	});

	it("blocks USDC.e condition IDs", () => {
		const guard = new UsdcRejectionGuard();
		const ctx = makeCtx({ cid: "market-usdc.e-v2" });
		const result = guard.check(ctx);
		expect(result.type).toBe("block");
		if (result.type === "block") {
			expect(result.guard).toBe("UsdcRejection");
		}
	});

	it("blocks case-insensitively", () => {
		const guard = new UsdcRejectionGuard();
		const ctx = makeCtx({ cid: "market-USDC.E-test" });
		expect(guard.check(ctx).type).toBe("block");
	});
});
