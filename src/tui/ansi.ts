import type { Decimal } from "../shared/decimal.js";

export const RESET = "\x1b[0m";
export const GREEN = "\x1b[32m";
export const RED = "\x1b[31m";
export const YELLOW = "\x1b[33m";
export const CYAN = "\x1b[36m";
export const BOLD = "\x1b[1m";
export const CLEAR_SCREEN = "\x1b[2J\x1b[H";

export function colorize(text: string, color: string): string {
	return `${color}${text}${RESET}`;
}

export function bold(text: string): string {
	return `${BOLD}${text}${RESET}`;
}

export function clearScreen(): string {
	return CLEAR_SCREEN;
}

export function moveCursor(row: number, col: number): string {
	return `\x1b[${row};${col}H`;
}

export function pnlColor(value: Decimal): string {
	return value.isNegative() ? RED : GREEN;
}
