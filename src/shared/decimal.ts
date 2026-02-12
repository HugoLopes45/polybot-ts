/**
 * Decimal — safe financial math wrapper.
 *
 * Phase 2: internals swapped from BigInt to decimal.js-light via LibDecimal.
 * Public API unchanged — all consumers are unaffected (Rule 14 wrapper pattern).
 *
 * All financial values (prices, sizes, balances, P&L) MUST use Decimal.
 * Never use raw `number` for money.
 */
import { LibDecimal } from "../lib/decimal/index.js";

export class Decimal {
	private readonly raw: LibDecimal;

	private constructor(raw: LibDecimal) {
		this.raw = raw;
	}

	// ── Factories ──────────────────────────────────────────────────

	static from(value: string | number): Decimal {
		if (typeof value === "number") {
			if (!Number.isFinite(value)) {
				throw new Error(`Decimal.from: invalid number ${value}`);
			}
		}
		if (typeof value === "string" && value.trim().length === 0) {
			throw new Error("Decimal.from: empty string");
		}
		return new Decimal(LibDecimal.from(value));
	}

	static zero(): Decimal {
		return new Decimal(LibDecimal.zero());
	}

	static one(): Decimal {
		return new Decimal(LibDecimal.one());
	}

	// ── Arithmetic (immutable) ─────────────────────────────────────

	add(other: Decimal): Decimal {
		return new Decimal(this.raw.add(other.raw));
	}

	sub(other: Decimal): Decimal {
		return new Decimal(this.raw.sub(other.raw));
	}

	mul(other: Decimal): Decimal {
		return new Decimal(this.raw.mul(other.raw));
	}

	div(other: Decimal): Decimal {
		if (other.raw.isZero()) {
			throw new Error("Decimal.div: division by zero");
		}
		return new Decimal(this.raw.div(other.raw));
	}

	neg(): Decimal {
		return new Decimal(this.raw.neg());
	}

	abs(): Decimal {
		return new Decimal(this.raw.abs());
	}

	// ── Comparison ─────────────────────────────────────────────────

	eq(other: Decimal): boolean {
		return this.raw.eq(other.raw);
	}

	gt(other: Decimal): boolean {
		return this.raw.gt(other.raw);
	}

	gte(other: Decimal): boolean {
		return this.raw.gte(other.raw);
	}

	lt(other: Decimal): boolean {
		return this.raw.lt(other.raw);
	}

	lte(other: Decimal): boolean {
		return this.raw.lte(other.raw);
	}

	isZero(): boolean {
		return this.raw.isZero();
	}

	isPositive(): boolean {
		return this.raw.isPositive();
	}

	isNegative(): boolean {
		return this.raw.isNegative();
	}

	// ── Min / Max ──────────────────────────────────────────────────

	static min(a: Decimal, b: Decimal): Decimal {
		return a.lte(b) ? a : b;
	}

	static max(a: Decimal, b: Decimal): Decimal {
		return a.gte(b) ? a : b;
	}

	// ── Conversion ─────────────────────────────────────────────────

	toNumber(): number {
		return this.raw.toNumber();
	}

	toString(): string {
		return this.raw.toString();
	}

	toFixed(places: number): string {
		return this.raw.toFixed(places);
	}
}
