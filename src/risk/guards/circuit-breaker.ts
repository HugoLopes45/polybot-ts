import type { Decimal } from "../../shared/decimal.js";
import type { EntryGuard, GuardContext, GuardVerdict } from "../types.js";
import { allow, blockFatal, blockFatalWithValues } from "../types.js";

export class CircuitBreakerGuard implements EntryGuard {
	readonly name = "CircuitBreaker";
	readonly isSafetyCritical = true;
	private readonly maxDailyLoss: Decimal;
	private readonly maxDrawdownPct: number;
	private readonly cooldownMs: number;
	private readonly maxConsecutiveLosses: number;
	private tripped: boolean;
	private trippedAtMs: number | null;

	private constructor(opts: {
		maxDailyLoss: Decimal;
		maxDrawdownPct: number;
		cooldownMs: number;
		maxConsecutiveLosses: number;
	}) {
		this.maxDailyLoss = opts.maxDailyLoss;
		this.maxDrawdownPct = opts.maxDrawdownPct;
		this.cooldownMs = opts.cooldownMs;
		this.maxConsecutiveLosses = opts.maxConsecutiveLosses;
		this.tripped = false;
		this.trippedAtMs = null;
	}

	static create(maxDailyLoss: Decimal, maxDrawdownPct: number): CircuitBreakerGuard {
		return new CircuitBreakerGuard({
			maxDailyLoss,
			maxDrawdownPct,
			cooldownMs: 1_800_000,
			maxConsecutiveLosses: 5,
		});
	}

	static withCooldown(
		maxDailyLoss: Decimal,
		maxDrawdownPct: number,
		cooldownMs: number,
	): CircuitBreakerGuard {
		return new CircuitBreakerGuard({
			maxDailyLoss,
			maxDrawdownPct,
			cooldownMs,
			maxConsecutiveLosses: 5,
		});
	}

	isTripped(): boolean {
		return this.tripped;
	}

	reset(): void {
		this.tripped = false;
		this.trippedAtMs = null;
	}

	check(ctx: GuardContext): GuardVerdict {
		const now = ctx.nowMs();

		if (this.tripped) {
			if (this.trippedAtMs !== null && now - this.trippedAtMs >= this.cooldownMs) {
				this.reset();
			} else {
				return blockFatal(this.name, "circuit breaker tripped — cooling down");
			}
		}

		const dailyPnl = ctx.dailyPnl();
		if (dailyPnl.isNegative() && dailyPnl.abs().gte(this.maxDailyLoss)) {
			this.tripped = true;
			this.trippedAtMs = now;
			return blockFatalWithValues(
				this.name,
				"daily loss limit",
				dailyPnl.abs().toNumber(),
				this.maxDailyLoss.toNumber(),
			);
		}

		const losses = ctx.consecutiveLosses();
		if (losses >= this.maxConsecutiveLosses) {
			this.tripped = true;
			this.trippedAtMs = now;
			return blockFatalWithValues(
				this.name,
				"consecutive losses",
				losses,
				this.maxConsecutiveLosses,
			);
		}

		return allow();
	}
}
