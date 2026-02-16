/**
 * Market replay generators for backtesting.
 *
 * Each generator produces an iterable of ReplayTick, simulating different market conditions.
 */
import { Decimal } from "../shared/decimal.js";
import type { MarketSide } from "../shared/market-side.js";
import type { GeneratorConfig, ReplayTick } from "./types.js";

const DEFAULT_SPREAD = 0.02;

/** Seeded PRNG (mulberry32). Returns { value, seed } where value is in [-0.5, 0.5). */
function nextRand(seed: number): { value: number; seed: number } {
	const s = (seed + 0x6d2b79f5) | 0;
	let t = Math.imul(s ^ (s >>> 15), 1 | s);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5;
	return { value, seed: s };
}

function clampMid(v: number): number {
	return Math.max(0.01, Math.min(0.99, v));
}

function makeTick(timestampMs: number, mid: number, spread: number, side: MarketSide): ReplayTick {
	const half = spread / 2;
	return {
		timestampMs,
		bid: Decimal.from(Math.max(0.001, Math.min(0.999, mid - half))),
		ask: Decimal.from(Math.max(0.001, Math.min(0.999, mid + half))),
		side,
	};
}

/** Linear price trend from startPrice to endPrice. */
export function* priceTrend(
	config: GeneratorConfig,
	startPrice: number,
	endPrice: number,
	spread = DEFAULT_SPREAD,
): Iterable<ReplayTick> {
	const { startMs, tickIntervalMs, numTicks, side } = config;
	for (let i = 0; i < numTicks; i++) {
		const t = numTicks > 1 ? i / (numTicks - 1) : 0;
		const mid = startPrice + (endPrice - startPrice) * t;
		yield makeTick(startMs + i * tickIntervalMs, mid, spread, side);
	}
}

/** Random walk with specified volatility. */
export function* randomWalk(
	config: GeneratorConfig,
	startPrice: number,
	volatility: number,
	spread = DEFAULT_SPREAD,
	seed = 42,
): Iterable<ReplayTick> {
	const { startMs, tickIntervalMs, numTicks, side } = config;
	let mid = startPrice;
	let s = seed;

	for (let i = 0; i < numTicks; i++) {
		yield makeTick(startMs + i * tickIntervalMs, mid, spread, side);
		const r = nextRand(s);
		s = r.seed;
		mid = clampMid(mid + volatility * r.value);
	}
}

/** Mean-reverting process around a target price. */
export function* meanReverting(
	config: GeneratorConfig,
	targetPrice: number,
	reversion: number,
	volatility: number,
	spread = DEFAULT_SPREAD,
	seed = 42,
): Iterable<ReplayTick> {
	const { startMs, tickIntervalMs, numTicks, side } = config;
	let mid = targetPrice;
	let s = seed;

	for (let i = 0; i < numTicks; i++) {
		yield makeTick(startMs + i * tickIntervalMs, mid, spread, side);
		const r = nextRand(s);
		s = r.seed;
		const drift = reversion * (targetPrice - mid);
		mid = clampMid(mid + drift + volatility * r.value);
	}
}

/** Countdown to expiry: price trends toward 0 or 1 as time runs out. */
export function* expiryCountdown(
	config: GeneratorConfig,
	settlementPrice: number,
	startPrice: number,
	volatility: number,
	spread = DEFAULT_SPREAD,
	seed = 42,
): Iterable<ReplayTick> {
	const { startMs, tickIntervalMs, numTicks, side } = config;
	let mid = startPrice;
	let s = seed;

	for (let i = 0; i < numTicks; i++) {
		const progress = numTicks > 1 ? i / (numTicks - 1) : 1;
		const drift = (settlementPrice - mid) * progress * 0.1;
		const volDecay = volatility * (1 - progress * 0.8);

		yield makeTick(startMs + i * tickIntervalMs, mid, spread * (1 + progress), side);

		const r = nextRand(s);
		s = r.seed;
		mid = clampMid(mid + drift + volDecay * r.value);
	}
}
