/**
 * LibDecimal — domain-agnostic wrapper around decimal.js-light.
 *
 * Provides precise decimal arithmetic without IEEE 754 float errors.
 * All domain code should use this through the shared/decimal facade,
 * never importing decimal.js-light directly (Rule 14).
 */
import DecimalLight from "decimal.js-light";

DecimalLight.set({ precision: 40 });

export class LibDecimal {
	private readonly raw: DecimalLight;

	private constructor(raw: DecimalLight) {
		this.raw = raw;
	}

	// ── Factories ──────────────────────────────────────────────────

	static from(value: string | number): LibDecimal {
		if (typeof value === "number") {
			if (!Number.isFinite(value)) {
				throw new Error(`LibDecimal.from: invalid number ${value}`);
			}
			return new LibDecimal(new DecimalLight(value));
		}
		const trimmed = value.trim();
		if (trimmed.length === 0) {
			throw new Error("LibDecimal.from: empty string");
		}
		return new LibDecimal(new DecimalLight(trimmed));
	}

	static zero(): LibDecimal {
		return new LibDecimal(new DecimalLight(0));
	}

	static one(): LibDecimal {
		return new LibDecimal(new DecimalLight(1));
	}

	// ── Arithmetic (immutable) ─────────────────────────────────────

	add(other: LibDecimal): LibDecimal {
		return new LibDecimal(this.raw.plus(other.raw));
	}

	sub(other: LibDecimal): LibDecimal {
		return new LibDecimal(this.raw.minus(other.raw));
	}

	mul(other: LibDecimal): LibDecimal {
		return new LibDecimal(this.raw.times(other.raw));
	}

	div(other: LibDecimal): LibDecimal {
		if (other.raw.isZero()) {
			throw new Error("LibDecimal.div: division by zero");
		}
		return new LibDecimal(this.raw.dividedBy(other.raw));
	}

	neg(): LibDecimal {
		return new LibDecimal(this.raw.negated());
	}

	abs(): LibDecimal {
		return new LibDecimal(this.raw.absoluteValue());
	}

	// ── Comparison ─────────────────────────────────────────────────

	cmp(other: LibDecimal): -1 | 0 | 1 {
		return this.raw.comparedTo(other.raw) as -1 | 0 | 1;
	}

	eq(other: LibDecimal): boolean {
		return this.raw.equals(other.raw);
	}

	gt(other: LibDecimal): boolean {
		return this.raw.greaterThan(other.raw);
	}

	gte(other: LibDecimal): boolean {
		return this.raw.greaterThanOrEqualTo(other.raw);
	}

	lt(other: LibDecimal): boolean {
		return this.raw.lessThan(other.raw);
	}

	lte(other: LibDecimal): boolean {
		return this.raw.lessThanOrEqualTo(other.raw);
	}

	isZero(): boolean {
		return this.raw.isZero();
	}

	isPositive(): boolean {
		return this.raw.greaterThan(0);
	}

	isNegative(): boolean {
		return this.raw.lessThan(0);
	}

	// ── Conversion ─────────────────────────────────────────────────

	toString(): string {
		const fixed = this.raw.toFixed();
		if (fixed.indexOf(".") === -1) {
			return fixed;
		}
		const stripped = fixed.replace(/0+$/, "").replace(/\.$/, "");
		return stripped;
	}

	toFixed(places: number): string {
		return this.raw.toFixed(places);
	}

	toNumber(): number {
		return this.raw.toNumber();
	}
}
