import type { DetectorContextLike, ExitPolicy, ExitReason, PositionLike } from "../types.js";

export class NearExpiryExit implements ExitPolicy {
	readonly name = "NearExpiry";
	private readonly exitWithinMs: number;

	private constructor(exitWithinMs: number) {
		this.exitWithinMs = exitWithinMs;
	}

	static create(exitWithinMs: number): NearExpiryExit {
		return new NearExpiryExit(exitWithinMs);
	}

	static fromSecs(secs: number): NearExpiryExit {
		return new NearExpiryExit(secs * 1_000);
	}

	static short(): NearExpiryExit {
		return NearExpiryExit.fromSecs(30);
	}

	static normal(): NearExpiryExit {
		return NearExpiryExit.fromSecs(60);
	}

	static long(): NearExpiryExit {
		return NearExpiryExit.fromSecs(120);
	}

	shouldExit(_position: PositionLike, ctx: DetectorContextLike): ExitReason | null {
		const remaining = ctx.timeRemainingMs();
		if (remaining <= this.exitWithinMs) {
			return { type: "near_expiry", remainingSecs: remaining / 1_000 };
		}
		return null;
	}
}
