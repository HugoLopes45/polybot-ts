import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import {
	calcCalmarRatio,
	calcMaxDrawdown,
	calcProfitFactor,
	calcSharpe,
	calcWinRate,
} from "./metrics.js";

const d = (n: string | number) => Decimal.from(n);

describe("backtest metrics", () => {
	describe("calcSharpe", () => {
		it("returns zero for empty returns", () => {
			expect(calcSharpe([]).toNumber()).toBe(0);
		});

		it("returns zero for single return", () => {
			expect(calcSharpe([d("0.05")]).toNumber()).toBe(0);
		});

		it("returns zero for constant returns (zero stddev)", () => {
			const returns = [d("0.01"), d("0.01"), d("0.01")];
			expect(calcSharpe(returns).toNumber()).toBe(0);
		});

		it("computes positive Sharpe for profitable strategy", () => {
			const returns = [d("0.02"), d("0.03"), d("0.01"), d("0.04"), d("0.02")];
			const sharpe = calcSharpe(returns);
			expect(sharpe.toNumber()).toBeGreaterThan(0);
		});

		it("computes negative Sharpe for losing strategy", () => {
			const returns = [d("-0.02"), d("-0.03"), d("-0.01"), d("-0.04")];
			const sharpe = calcSharpe(returns);
			expect(sharpe.toNumber()).toBeLessThan(0);
		});

		it("annualizes with default 252 trading days", () => {
			const returns = [d("0.01"), d("0.02"), d("0.03"), d("0.01"), d("0.02")];
			const sharpe = calcSharpe(returns);
			// Annualized = dailySharpe * sqrt(252)
			expect(sharpe.toNumber()).toBeGreaterThan(1);
		});
	});

	describe("calcProfitFactor", () => {
		it("returns zero for no trades", () => {
			expect(calcProfitFactor([]).toNumber()).toBe(0);
		});

		it("returns Infinity proxy for all wins (no losses)", () => {
			const pnls = [d("10"), d("20"), d("30")];
			const pf = calcProfitFactor(pnls);
			expect(pf.toNumber()).toBeGreaterThan(100);
		});

		it("returns zero for all losses", () => {
			const pnls = [d("-10"), d("-20")];
			expect(calcProfitFactor(pnls).toNumber()).toBe(0);
		});

		it("computes correctly for mixed trades", () => {
			// Gross profit = 30+20 = 50, Gross loss = 10+5 = 15
			const pnls = [d("30"), d("-10"), d("20"), d("-5")];
			const pf = calcProfitFactor(pnls);
			expect(pf.toNumber()).toBeCloseTo(50 / 15, 2);
		});
	});

	describe("calcMaxDrawdown", () => {
		it("returns zero for empty equity", () => {
			expect(calcMaxDrawdown([]).toNumber()).toBe(0);
		});

		it("returns zero for monotonically increasing equity", () => {
			const equity = [d("100"), d("110"), d("120"), d("130")];
			expect(calcMaxDrawdown(equity).toNumber()).toBe(0);
		});

		it("computes correct max drawdown", () => {
			// Peak at 130, trough at 90 → drawdown = (130-90)/130 = 0.3077
			const equity = [d("100"), d("130"), d("110"), d("90"), d("120")];
			const dd = calcMaxDrawdown(equity);
			expect(dd.toNumber()).toBeCloseTo(40 / 130, 4);
		});

		it("handles single peak-trough", () => {
			const equity = [d("100"), d("50")];
			expect(calcMaxDrawdown(equity).toNumber()).toBeCloseTo(0.5, 4);
		});
	});

	describe("calcCalmarRatio", () => {
		it("returns zero when max drawdown is zero", () => {
			const equity = [d("100"), d("110"), d("120")];
			expect(calcCalmarRatio(equity, 252).toNumber()).toBe(0);
		});

		it("computes annualized return / max drawdown", () => {
			// Start 100, end 120, 252 days → annual return ≈ 20%
			// Max drawdown = (110-90)/110 ≈ 18.18%
			const equity = [d("100"), d("110"), d("90"), d("120")];
			const calmar = calcCalmarRatio(equity, 252);
			expect(calmar.toNumber()).toBeGreaterThan(0);
		});
	});

	describe("calcWinRate", () => {
		it("returns zero for no trades", () => {
			expect(calcWinRate([]).toNumber()).toBe(0);
		});

		it("returns 1 for all wins", () => {
			const pnls = [d("10"), d("5"), d("20")];
			expect(calcWinRate(pnls).toNumber()).toBe(1);
		});

		it("returns 0 for all losses", () => {
			const pnls = [d("-10"), d("-5")];
			expect(calcWinRate(pnls).toNumber()).toBe(0);
		});

		it("computes correctly for mixed trades", () => {
			// 3 wins, 2 losses → 60%
			const pnls = [d("10"), d("-5"), d("20"), d("-3"), d("15")];
			expect(calcWinRate(pnls).toNumber()).toBeCloseTo(0.6, 4);
		});

		it("counts zero P&L as non-win", () => {
			const pnls = [d("10"), d("0"), d("-5")];
			expect(calcWinRate(pnls).toNumber()).toBeCloseTo(1 / 3, 4);
		});
	});
});
