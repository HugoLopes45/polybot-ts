import type { EntryGuard, GuardContext, GuardVerdict } from "../types.js";
import { allow, blockFatal, blockFatalWithValues } from "../types.js";

export const KillSwitchMode = {
	Full: "full",
	ExitsOnly: "exits_only",
} as const;

export type KillSwitchMode = (typeof KillSwitchMode)[keyof typeof KillSwitchMode];

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

	static create(softPct = 3, hardPct = 5): KillSwitchGuard {
		return new KillSwitchGuard(softPct, hardPct);
	}

	engage(reason = "manual", nowMs?: number): void {
		this.engaged = true;
		this.mode = KillSwitchMode.Full;
		this.reason = reason;
		this.engagedAtMs = nowMs ?? Date.now();
	}

	engageExitsOnly(reason = "soft threshold", nowMs?: number): void {
		this.engaged = true;
		this.mode = KillSwitchMode.ExitsOnly;
		this.reason = reason;
		this.engagedAtMs = nowMs ?? Date.now();
	}

	disengage(): void {
		this.engaged = false;
		this.reason = null;
		this.engagedAtMs = null;
	}

	isEngaged(): boolean {
		return this.engaged;
	}

	currentMode(): KillSwitchMode {
		return this.mode;
	}

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
