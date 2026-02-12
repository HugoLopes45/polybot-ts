import type { EntryGuard, GuardContext, GuardVerdict } from "../types.js";
import { allow, blockWithValues } from "../types.js";

/**
 * Guard that enforces a minimum time delay between trades on the same condition.
 * Prevents rapid-fire trading and allows markets to stabilize between entries.
 *
 * @example
 * ```ts
 * const guard = CooldownGuard.fromSecs(60);
 * const verdict = guard.check(ctx);
 * ```
 */
export class CooldownGuard implements EntryGuard {
	readonly name = "Cooldown";
	private readonly cooldownMs: number;

	private constructor(cooldownMs: number) {
		this.cooldownMs = cooldownMs;
	}

	/**
	 * Creates a guard with the specified cooldown duration.
	 * @param cooldownMs - Cooldown period in milliseconds
	 */
	static create(cooldownMs: number): CooldownGuard {
		return new CooldownGuard(cooldownMs);
	}

	/**
	 * Creates a guard with cooldown specified in seconds.
	 * @param secs - Cooldown period in seconds
	 */
	static fromSecs(secs: number): CooldownGuard {
		return new CooldownGuard(secs * 1_000);
	}

	/**
	 * Creates a guard with a 10-second cooldown.
	 */
	static short(): CooldownGuard {
		return CooldownGuard.fromSecs(10);
	}

	/**
	 * Creates a guard with a 60-second (1 minute) cooldown.
	 */
	static normal(): CooldownGuard {
		return CooldownGuard.fromSecs(60);
	}

	/**
	 * Creates a guard with a 300-second (5 minute) cooldown.
	 */
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
