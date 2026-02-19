import { Decimal } from "../shared/decimal.js";
import { SystemClock } from "../shared/time.js";
import type { Clock } from "../shared/time.js";
import { DashboardRenderer } from "./renderer.js";
import type { AlertEntry, DashboardConfig, DashboardStats } from "./types.js";

/**
 * Terminal-based dashboard for real-time strategy monitoring.
 *
 * Lifecycle: construct → start() → update(stats) in a loop → stop().
 * Internal alerts (via pushAlert) override `DashboardStats.alerts` during rendering.
 */
export class TerminalDashboard {
	private readonly clock: Clock;
	private readonly refreshIntervalMs: number;
	private readonly maxAlerts: number;
	private readonly startMs: number;
	private currentStats: DashboardStats | null = null;
	private alerts: AlertEntry[] = [];
	private timer: ReturnType<typeof setInterval> | null = null;
	private readonly output: { write(s: string): void };

	constructor(config?: DashboardConfig, output?: { write(s: string): void }) {
		this.clock = config?.clock ?? SystemClock;
		this.refreshIntervalMs = config?.refreshIntervalMs ?? 1000;
		this.maxAlerts = config?.maxAlerts ?? 10;
		this.startMs = this.clock.now();
		this.output = output ?? process.stdout;
		if (this.refreshIntervalMs <= 0) {
			throw new Error("refreshIntervalMs must be > 0");
		}
		if (this.maxAlerts < 0) {
			throw new Error("maxAlerts must be >= 0");
		}
	}

	start(): void {
		if (this.timer !== null) return;
		this.timer = setInterval(() => this.render(), this.refreshIntervalMs);
	}

	stop(): void {
		if (this.timer !== null) {
			clearInterval(this.timer);
			this.timer = null;
		}
		try {
			this.output.write("\x1b[2J\x1b[H");
		} catch {
			// Best-effort clear screen — output stream may be closed
		}
	}

	update(stats: DashboardStats): void {
		this.currentStats = stats;
	}

	pushAlert(message: string, level: "info" | "warn" | "error"): void {
		this.alerts = [...this.alerts, { message, level, timestamp: this.clock.now() }].slice(
			-this.maxAlerts,
		);
	}

	private render(): void {
		try {
			const stats = this.buildStats();
			const output = DashboardRenderer.render(stats, this.clock.now());
			this.output.write(output);
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			this.pushAlert(`Render error: ${msg}`, "error");
		}
	}

	private buildStats(): DashboardStats {
		const base = this.currentStats ?? {
			uptimeMs: 0,
			positions: [],
			recentTrades: [],
			alerts: [],
			portfolioValue: Decimal.zero(),
			dailyPnl: Decimal.zero(),
			winRate: 0,
			tickLatencyP50Ms: 0,
			tickLatencyP99Ms: 0,
		};
		return {
			...base,
			uptimeMs: this.clock.now() - this.startMs,
			alerts: this.alerts,
		};
	}
}
