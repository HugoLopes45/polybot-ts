import type { Decimal } from "../shared/decimal.js";
import { CYAN, bold, clearScreen, colorize, pnlColor } from "./ansi.js";
import type { AlertEntry, DashboardStats, PositionRow, TradeRow } from "./types.js";

function renderHeader(uptimeMs: number, nowMs: number): string {
	const ts = formatTimestamp(nowMs);
	const up = formatUptime(uptimeMs);
	return `${bold("═══ POLYBOT DASHBOARD ═══")}  ${ts}  Uptime: ${up}`;
}

function renderPortfolio(portfolioValue: Decimal, dailyPnl: Decimal): string {
	const pnlStr = formatPnl(dailyPnl);
	const color = pnlColor(dailyPnl);
	return `Portfolio: $${portfolioValue.toFixed(2)} | Daily P&L: ${colorize(pnlStr, color)}`;
}

function renderPositions(positions: readonly PositionRow[]): string {
	const lines: string[] = [bold("Open Positions")];
	if (positions.length === 0) {
		lines.push("  (none)");
		return lines.join("\n");
	}
	lines.push("  Condition       Side  Size     Entry    Unrealized P&L");
	for (const p of positions) {
		const pnlStr = formatPnl(p.unrealizedPnl);
		const color = pnlColor(p.unrealizedPnl);
		const id = p.conditionId.slice(0, 14).padEnd(14);
		lines.push(
			`  ${id}  ${p.side.padEnd(4)}  ${p.size.toFixed(2).padStart(7)}  ${p.entryPrice.toFixed(4).padStart(7)}  ${colorize(pnlStr, color)}`,
		);
	}
	return lines.join("\n");
}

function renderTrades(trades: readonly TradeRow[]): string {
	const lines: string[] = [bold("Recent Trades")];
	const visible = trades.slice(-5);
	if (visible.length === 0) {
		lines.push("  (none)");
		return lines.join("\n");
	}
	for (const t of visible) {
		const ts = formatTimestamp(t.timestamp);
		const id = t.conditionId.slice(0, 14).padEnd(14);
		lines.push(`  ${ts}  ${id}  ${t.side.padEnd(4)}  ${t.size.toFixed(2)} @ ${t.price.toFixed(4)}`);
	}
	return lines.join("\n");
}

function renderAlerts(alerts: readonly AlertEntry[]): string {
	const lines: string[] = [bold("Alerts")];
	const visible = alerts.slice(-10);
	if (visible.length === 0) {
		lines.push("  (none)");
		return lines.join("\n");
	}
	for (const a of visible) {
		const ts = formatTimestamp(a.timestamp);
		const color = alertColor(a.level);
		lines.push(`  ${ts} ${colorize(`[${a.level.toUpperCase()}]`, color)} ${a.message}`);
	}
	return lines.join("\n");
}

function safeFixed(value: number, digits: number): string {
	return Number.isFinite(value) ? value.toFixed(digits) : "---";
}

function renderLatency(p50: number, p99: number): string {
	return `Latency p50: ${safeFixed(p50, 1)}ms | p99: ${safeFixed(p99, 1)}ms`;
}

function formatPnl(value: Decimal): string {
	const abs = value.abs().toFixed(2);
	return value.isNegative() ? `-$${abs}` : `+$${abs}`;
}

function formatTimestamp(ms: number): string {
	const d = new Date(ms);
	const h = d.getUTCHours().toString().padStart(2, "0");
	const m = d.getUTCMinutes().toString().padStart(2, "0");
	const s = d.getUTCSeconds().toString().padStart(2, "0");
	return `${h}:${m}:${s}`;
}

function formatUptime(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	return `${hours}h ${minutes}m ${seconds}s`;
}

function alertColor(level: "info" | "warn" | "error"): string {
	if (level === "error") return "\x1b[31m";
	if (level === "warn") return "\x1b[33m";
	return CYAN;
}

/** Pure renderer — converts a DashboardStats snapshot to an ANSI terminal string. */
export const DashboardRenderer = {
	render(stats: DashboardStats, nowMs: number): string {
		const lines: string[] = [];
		lines.push(clearScreen());
		lines.push(renderHeader(stats.uptimeMs, nowMs));
		lines.push("════════════════════════════════════════════════════════════");
		lines.push(renderPortfolio(stats.portfolioValue, stats.dailyPnl));
		lines.push(`Win Rate: ${safeFixed(stats.winRate * 100, 1)}%`);
		lines.push("");
		lines.push(renderPositions(stats.positions));
		lines.push("");
		lines.push(renderTrades(stats.recentTrades));
		lines.push("");
		lines.push(renderAlerts(stats.alerts));
		lines.push("");
		lines.push(renderLatency(stats.tickLatencyP50Ms, stats.tickLatencyP99Ms));
		return lines.join("\n");
	},
};
