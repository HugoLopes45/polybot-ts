export interface ReconnectionConfig {
	readonly baseDelayMs: number;
	readonly maxDelayMs: number;
	readonly maxAttempts: number;
	readonly jitterFactor: number;
}

/**
 * Exponential backoff reconnection policy with jitter and attempt limiting.
 */
export class ReconnectionPolicy {
	private readonly config: ReconnectionConfig;
	private attempts = 0;

	constructor(config: ReconnectionConfig) {
		this.config = config;
	}

	nextDelay(): number {
		const raw = this.config.baseDelayMs * 2 ** this.attempts;
		const capped = Math.min(raw, this.config.maxDelayMs);
		this.attempts += 1;
		if (this.config.jitterFactor === 0) return capped;
		const jitter = capped * this.config.jitterFactor * (Math.random() * 2 - 1);
		return Math.max(0, Math.round(capped + jitter));
	}

	reset(): void {
		this.attempts = 0;
	}

	shouldRetry(): boolean {
		return this.attempts < this.config.maxAttempts;
	}
}
