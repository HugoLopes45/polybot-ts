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

	/**
	 * Creates a LibDecimal from a string or number.
	 * @param value - A numeric value or decimal string
	 * @throws Error if value is not finite (for numbers) or empty (for strings)
	 * @example LibDecimal.from("123.45")
	 * @example LibDecimal.from(100)
	 */
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

	/**
	 * Returns a LibDecimal representing zero.
	 * @example LibDecimal.zero() // "0"
	 */
	static zero(): LibDecimal {
		return new LibDecimal(new DecimalLight(0));
	}

	/**
	 * Returns a LibDecimal representing one.
	 * @example LibDecimal.one() // "1"
	 */
	static one(): LibDecimal {
		return new LibDecimal(new DecimalLight(1));
	}

	// ── Arithmetic (immutable) ─────────────────────────────────────

	/**
	 * Adds another LibDecimal to this value (immutable).
	 * @param other - The value to add
	 * @example a.add(b)
	 */
	add(other: LibDecimal): LibDecimal {
		return new LibDecimal(this.raw.plus(other.raw));
	}

	/**
	 * Subtracts another LibDecimal from this value (immutable).
	 * @param other - The value to subtract
	 * @example a.sub(b)
	 */
	sub(other: LibDecimal): LibDecimal {
		return new LibDecimal(this.raw.minus(other.raw));
	}

	/**
	 * Multiplies this value by another LibDecimal (immutable).
	 * @param other - The value to multiply by
	 * @example a.mul(b)
	 */
	mul(other: LibDecimal): LibDecimal {
		return new LibDecimal(this.raw.times(other.raw));
	}

	/**
	 * Divides this value by another LibDecimal (immutable).
	 * @param other - The value to divide by
	 * @throws Error if dividing by zero
	 * @example a.div(b)
	 */
	div(other: LibDecimal): LibDecimal {
		if (other.raw.isZero()) {
			throw new Error("LibDecimal.div: division by zero");
		}
		return new LibDecimal(this.raw.dividedBy(other.raw));
	}

	/**
	 * Returns the negation of this value (immutable).
	 * @example a.neg()
	 */
	neg(): LibDecimal {
		return new LibDecimal(this.raw.negated());
	}

	/**
	 * Returns the absolute value of this number (immutable).
	 * @example a.abs()
	 */
	abs(): LibDecimal {
		return new LibDecimal(this.raw.absoluteValue());
	}

	// ── Comparison ─────────────────────────────────────────────────

	/**
	 * Compares this value to another LibDecimal.
	 * @param other - The value to compare
	 * @returns -1 if this < other, 0 if equal, 1 if this > other
	 * @example a.cmp(b) // -1, 0, or 1
	 */
	cmp(other: LibDecimal): -1 | 0 | 1 {
		return this.raw.comparedTo(other.raw) as -1 | 0 | 1;
	}

	/**
	 * Checks if this value equals another LibDecimal.
	 * @param other - The value to compare
	 * @example a.eq(b)
	 */
	eq(other: LibDecimal): boolean {
		return this.raw.equals(other.raw);
	}

	/**
	 * Checks if this value is greater than another LibDecimal.
	 * @param other - The value to compare
	 * @example a.gt(b)
	 */
	gt(other: LibDecimal): boolean {
		return this.raw.greaterThan(other.raw);
	}

	/**
	 * Checks if this value is greater than or equal to another LibDecimal.
	 * @param other - The value to compare
	 * @example a.gte(b)
	 */
	gte(other: LibDecimal): boolean {
		return this.raw.greaterThanOrEqualTo(other.raw);
	}

	/**
	 * Checks if this value is less than another LibDecimal.
	 * @param other - The value to compare
	 * @example a.lt(b)
	 */
	lt(other: LibDecimal): boolean {
		return this.raw.lessThan(other.raw);
	}

	/**
	 * Checks if this value is less than or equal to another LibDecimal.
	 * @param other - The value to compare
	 * @example a.lte(b)
	 */
	lte(other: LibDecimal): boolean {
		return this.raw.lessThanOrEqualTo(other.raw);
	}

	/**
	 * Checks if this value is zero.
	 * @example a.isZero()
	 */
	isZero(): boolean {
		return this.raw.isZero();
	}

	/**
	 * Checks if this value is positive (greater than zero).
	 * @example a.isPositive()
	 */
	isPositive(): boolean {
		return this.raw.greaterThan(0);
	}

	/**
	 * Checks if this value is negative (less than zero).
	 * @example a.isNegative()
	 */
	isNegative(): boolean {
		return this.raw.lessThan(0);
	}

	// ── Extended math (via JS Math.*) ─────────────────────────────

	/**
	 * Square root. Uses Math.sqrt on the JS number representation.
	 * Suitable for prediction market values bounded [0, 1].
	 * @throws Error if value is negative
	 */
	sqrt(): LibDecimal {
		const n = this.raw.toNumber();
		if (n < 0) throw new Error("LibDecimal.sqrt: sqrt of negative");
		return LibDecimal.from(Math.sqrt(n));
	}

	/**
	 * Natural logarithm. Uses Math.log on the JS number representation.
	 * @throws Error if value is zero or negative
	 */
	ln(): LibDecimal {
		const n = this.raw.toNumber();
		if (n <= 0) throw new Error("LibDecimal.ln: ln of non-positive");
		return LibDecimal.from(Math.log(n));
	}

	/**
	 * Exponential (e^x). Uses Math.exp on the JS number representation.
	 */
	exp(): LibDecimal {
		return LibDecimal.from(Math.exp(this.raw.toNumber()));
	}

	/**
	 * Power (x^n). Uses Math.pow on the JS number representation.
	 * @param n - The exponent
	 */
	pow(n: number): LibDecimal {
		return LibDecimal.from(this.raw.toNumber() ** n);
	}

	// ── Conversion ─────────────────────────────────────────────────

	/**
	 * Converts to a string, removing unnecessary trailing zeros and decimal point.
	 * @example LibDecimal.from("1.500").toString() // "1.5"
	 */
	toString(): string {
		const fixed = this.raw.toFixed();
		if (fixed.indexOf(".") === -1) {
			return fixed;
		}
		const stripped = fixed.replace(/0+$/, "").replace(/\.$/, "");
		return stripped;
	}

	/**
	 * Converts to a fixed-point string with specified decimal places.
	 * @param places - Number of decimal places
	 * @example LibDecimal.from("1.23456").toFixed(2) // "1.23"
	 */
	toFixed(places: number): string {
		return this.raw.toFixed(places);
	}

	/**
	 * Converts to a JavaScript number. Use with caution - may lose precision.
	 * @example a.toNumber()
	 */
	toNumber(): number {
		return this.raw.toNumber();
	}
}
