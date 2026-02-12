/**
 * Time utilities — injectable clock for deterministic testing.
 *
 * All SDK code uses Clock.now() instead of Date.now() directly,
 * enabling time manipulation in tests without monkey-patching globals.
 */

export interface Clock {
	now(): number;
}

export const SystemClock: Clock = {
	now: () => Date.now(),
};

export class FakeClock implements Clock {
	private time: number;

	constructor(startMs = 0) {
		this.time = startMs;
	}

	now(): number {
		return this.time;
	}

	advance(ms: number): void {
		this.time += ms;
	}

	set(ms: number): void {
		this.time = ms;
	}
}

// ── Duration helpers ─────────────────────────────────────────────────

export const Duration = {
	ms: (n: number) => n,
	seconds: (n: number) => n * 1_000,
	minutes: (n: number) => n * 60_000,
	hours: (n: number) => n * 3_600_000,
} as const;
