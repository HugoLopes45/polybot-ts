/**
 * Thread configuration hints for latency-sensitive deployments.
 *
 * Node.js does not support OS-level CPU affinity natively. On Linux,
 * use `taskset -c 0 node bot.js` to pin to core 0. macOS does not
 * expose CPU affinity to user processes; use Docker `--cpuset-cpus`
 * for isolation.
 *
 * These hints document recommended settings; they do not enforce them.
 */

export interface ThreadConfig {
	/** Suggested number of worker threads for background processing. Defaults to 1. */
	readonly workerCount?: number;
	/** CPU affinity hint string (e.g. "0" for core 0). Informational only. */
	readonly affinityHint?: string;
}

export function getDefaultThreadConfig(): ThreadConfig {
	return { workerCount: 1 };
}

/**
 * Logs a startup advisory when non-default thread config is requested.
 * Does not actually pin threads — prints guidance to stderr.
 */
export function applyThreadConfig(config: ThreadConfig): void {
	if (config.affinityHint !== undefined) {
		const safe = config.affinityHint.replace(/[\r\n]/g, "");
		process.stderr.write(
			`[polybot] CPU affinity hint: ${safe}. ` +
				`Pin this process with: taskset -c ${safe} node bot.js\n`,
		);
	}
	if (config.workerCount !== undefined && config.workerCount > 1) {
		process.stderr.write(
			`[polybot] workerCount hint: ${config.workerCount}. Use Node.js worker_threads for background tasks.\n`,
		);
	}
}
