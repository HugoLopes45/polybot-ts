/**
 * ConnectivityWatchdog — detects stale data feeds.
 *
 * Graduated status:
 * - Healthy: last update < warningMs ago
 * - Degraded: last update >= warningMs (blocks new entries)
 * - Critical: last update >= criticalMs (triggers halt)
 */

import type { Clock } from "../shared/time.js";
import { Duration, SystemClock } from "../shared/time.js";
import { WatchdogStatus } from "./types.js";

export interface WatchdogConfig {
	readonly warningMs: number;
	readonly criticalMs: number;
}

export const DEFAULT_WATCHDOG_CONFIG: WatchdogConfig = {
	warningMs: Duration.seconds(15),
	criticalMs: Duration.seconds(30),
};

export class ConnectivityWatchdog {
	private lastTouchMs: number;
	private readonly config: WatchdogConfig;
	private readonly clock: Clock;

	constructor(config: WatchdogConfig = DEFAULT_WATCHDOG_CONFIG, clock: Clock = SystemClock) {
		this.config = config;
		this.clock = clock;
		this.lastTouchMs = clock.now();
	}

	/** Call on every data update to reset the timer */
	touch(): void {
		this.lastTouchMs = this.clock.now();
	}

	/** Evaluate current connectivity status */
	status(): WatchdogStatus {
		const elapsed = this.clock.now() - this.lastTouchMs;
		if (elapsed >= this.config.criticalMs) return WatchdogStatus.Critical;
		if (elapsed >= this.config.warningMs) return WatchdogStatus.Degraded;
		return WatchdogStatus.Healthy;
	}

	/** Time since last data update (ms) */
	silenceMs(): number {
		return this.clock.now() - this.lastTouchMs;
	}

	/** Whether entries should be blocked (degraded or worse) */
	shouldBlockEntries(): boolean {
		return this.status() !== WatchdogStatus.Healthy;
	}
}
