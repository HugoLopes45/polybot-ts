import type { EntryGuard, GuardContext, GuardVerdict } from "../types.js";
import { allow, blockFatal, blockFatalWithValues } from "../types.js";

/**
 * Operating modes for the kill switch guard.
 * - `full`: Blocks all trades (entries and exits)
 * - `exits_only`: Only blocks new entries, allows exits
 */
export const KillSwitchMode = {
	Full: "full",
	ExitsOnly: "exits_only",
} as const;

/**
 * Operating mode of the kill switch guard.
 */
export type KillSwitchMode = (typeof KillSwitchMode)[keyof typeof KillSwitchMode];

/**
 * Safety guard that halts trading when daily losses exceed configured thresholds.
 * Blocks all trades when hard threshold is breached, or blocks only new entries
 * when soft threshold is breached.
 *
 * @example
 * ```ts
 * const guard = KillSwitchGuard.create(3, 5); // 3% soft, 5% hard
 * const verdict = guard.check(ctx);
 * ```
 */
export class KillSwitchGuard implements EntryGuard {
	readonly name = "KillSwitch";
	readonly isSafetyCritical = true;
	private readonly softThresholdPct: number;
	private readonly hardThresholdPct: number;
	private engaged: boolean;
	private mode: KillSwitchMode;
	private engagedAtMs: number | null;
	private reason: string | null;

	private constructor(softPct: number, hardPct: number) {
		this.softThresholdPct = softPct;
		this.hardThresholdPct = hardPct;
		this.engaged = false;
		this.mode = KillSwitchMode.Full;
		this.engagedAtMs = null;
		this.reason = null;
	}

	/**
	 * Creates a new KillSwitchGuard with configurable thresholds.
	 * @param softPct - Soft threshold percentage (default: 3)
	 * @param hardPct - Hard threshold percentage (default: 5)
	 */
	static create(softPct = 3, hardPct = 5): KillSwitchGuard {
		return new KillSwitchGuard(softPct, hardPct);
	}

	/**
	 * Engages the kill switch in full mode, blocking all trades.
	 * @param reason - Reason for engagement (default: "manual")
	 * @param nowMs - Current timestamp in milliseconds
	 */
	engage(reason = "manual", nowMs?: number): void {
		this.engaged = true;
		this.mode = KillSwitchMode.Full;
		this.reason = reason;
		this.engagedAtMs = nowMs ?? Date.now();
	}

	/**
	 * Engages the kill switch in exits-only mode, blocking only new entries.
	 * @param reason - Reason for engagement (default: "soft threshold")
	 * @param nowMs - Current timestamp in milliseconds
	 */
	engageExitsOnly(reason = "soft threshold", nowMs?: number): void {
		this.engaged = true;
		this.mode = KillSwitchMode.ExitsOnly;
		this.reason = reason;
		this.engagedAtMs = nowMs ?? Date.now();
	}

	/**
	 * Disengages the kill switch, allowing trades to proceed.
	 */
	disengage(): void {
		this.engaged = false;
		this.reason = null;
		this.engagedAtMs = null;
	}

	/**
	 * @returns Whether the kill switch is currently engaged
	 */
	isEngaged(): boolean {
		return this.engaged;
	}

	/**
	 * @returns Current operating mode of the kill switch
	 */
	currentMode(): KillSwitchMode {
		return this.mode;
	}

	/**
	 * @returns Reason for engagement, or null if not engaged
	 */
	engagementReason(): string | null {
		return this.reason;
	}

	check(ctx: GuardContext): GuardVerdict {
		if (this.engaged) {
			return blockFatal(this.name, this.reason ?? "kill switch engaged");
		}

		const balance = ctx.availableBalance();
		if (balance.isZero()) return allow();

		const dailyLoss = ctx.dailyPnl();
		if (dailyLoss.isPositive() || dailyLoss.isZero()) return allow();

		const lossPct = dailyLoss.abs().div(balance).toNumber() * 100;

		if (lossPct >= this.hardThresholdPct) {
			this.engage("hard threshold breached", ctx.nowMs());
			return blockFatalWithValues(this.name, "hard loss limit", lossPct, this.hardThresholdPct);
		}

		if (lossPct >= this.softThresholdPct) {
			this.engageExitsOnly("soft threshold breached", ctx.nowMs());
			return blockFatalWithValues(this.name, "soft loss limit", lossPct, this.softThresholdPct);
		}

		return allow();
	}
}
