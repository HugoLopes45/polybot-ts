import type { EntryGuard, GuardContext, GuardVerdict } from "../types.js";
import { allow, blockWithValues } from "../types.js";

export class CooldownGuard implements EntryGuard {
	readonly name = "Cooldown";
	private readonly cooldownMs: number;

	private constructor(cooldownMs: number) {
		this.cooldownMs = cooldownMs;
	}

	static create(cooldownMs: number): CooldownGuard {
		return new CooldownGuard(cooldownMs);
	}

	static fromSecs(secs: number): CooldownGuard {
		return new CooldownGuard(secs * 1_000);
	}

	static short(): CooldownGuard {
		return CooldownGuard.fromSecs(10);
	}

	static normal(): CooldownGuard {
		return CooldownGuard.fromSecs(60);
	}

	static long(): CooldownGuard {
		return CooldownGuard.fromSecs(300);
	}

	check(ctx: GuardContext): GuardVerdict {
		const lastTrade = ctx.lastTradeTimeMs(ctx.conditionId);
		if (lastTrade === null) return allow();

		const elapsed = ctx.nowMs() - lastTrade;
		if (elapsed < this.cooldownMs) {
			return blockWithValues(
				this.name,
				"cooldown active",
				elapsed / 1_000,
				this.cooldownMs / 1_000,
			);
		}
		return allow();
	}
}
