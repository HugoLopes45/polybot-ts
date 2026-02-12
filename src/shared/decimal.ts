/**
 * Decimal — safe financial math wrapper.
 *
 * In Phase 0 we implement a lightweight immutable Decimal using native BigInt
 * arithmetic with fixed precision. In Phase 2 we swap internals to decimal.js-light
 * without changing the public API (Rule 14 wrapper pattern).
 *
 * All financial values (prices, sizes, balances, P&L) MUST use Decimal.
 * Never use raw `number` for money.
 */

const PRECISION = 18;
const SCALE = 10n ** BigInt(PRECISION);

export class Decimal {
	/** Internal representation: value * 10^18 as BigInt */
	private readonly raw: bigint;

	private constructor(raw: bigint) {
		this.raw = raw;
	}

	// ── Factories ──────────────────────────────────────────────────

	static from(value: string | number): Decimal {
		if (typeof value === "number") {
			if (!Number.isFinite(value)) {
				throw new Error(`Decimal.from: invalid number ${value}`);
			}
			return Decimal.fromString(value.toString());
		}
		return Decimal.fromString(value);
	}

	static zero(): Decimal {
		return new Decimal(0n);
	}

	static one(): Decimal {
		return new Decimal(SCALE);
	}

	private static fromString(s: string): Decimal {
		const trimmed = s.trim();
		if (trimmed.length === 0) {
			throw new Error("Decimal.from: empty string");
		}

		const negative = trimmed.startsWith("-");
		const abs = negative ? trimmed.slice(1) : trimmed;
		const dotIdx = abs.indexOf(".");

		let raw: bigint;
		if (dotIdx === -1) {
			raw = BigInt(abs) * SCALE;
		} else {
			const intPart = abs.slice(0, dotIdx) || "0";
			const fracPart = abs.slice(dotIdx + 1);
			const paddedFrac = fracPart.padEnd(PRECISION, "0").slice(0, PRECISION);
			raw = BigInt(intPart) * SCALE + BigInt(paddedFrac);
		}

		return new Decimal(negative ? -raw : raw);
	}

	// ── Arithmetic (immutable) ─────────────────────────────────────

	add(other: Decimal): Decimal {
		return new Decimal(this.raw + other.raw);
	}

	sub(other: Decimal): Decimal {
		return new Decimal(this.raw - other.raw);
	}

	mul(other: Decimal): Decimal {
		return new Decimal((this.raw * other.raw) / SCALE);
	}

	div(other: Decimal): Decimal {
		if (other.raw === 0n) {
			throw new Error("Decimal.div: division by zero");
		}
		return new Decimal((this.raw * SCALE) / other.raw);
	}

	neg(): Decimal {
		return new Decimal(-this.raw);
	}

	abs(): Decimal {
		return new Decimal(this.raw < 0n ? -this.raw : this.raw);
	}

	// ── Comparison ─────────────────────────────────────────────────

	eq(other: Decimal): boolean {
		return this.raw === other.raw;
	}

	gt(other: Decimal): boolean {
		return this.raw > other.raw;
	}

	gte(other: Decimal): boolean {
		return this.raw >= other.raw;
	}

	lt(other: Decimal): boolean {
		return this.raw < other.raw;
	}

	lte(other: Decimal): boolean {
		return this.raw <= other.raw;
	}

	isZero(): boolean {
		return this.raw === 0n;
	}

	isPositive(): boolean {
		return this.raw > 0n;
	}

	isNegative(): boolean {
		return this.raw < 0n;
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
		const intPart = this.raw / SCALE;
		const fracPart = this.raw % SCALE;
		const sign = this.raw < 0n ? -1 : 1;
		const absFrac = fracPart < 0n ? -fracPart : fracPart;
		return sign * (Number(intPart < 0n ? -intPart : intPart) + Number(absFrac) / Number(SCALE));
	}

	toString(): string {
		const negative = this.raw < 0n;
		const absRaw = negative ? -this.raw : this.raw;
		const intPart = absRaw / SCALE;
		const fracPart = absRaw % SCALE;
		const fracStr = fracPart.toString().padStart(PRECISION, "0").replace(/0+$/, "");
		const prefix = negative ? "-" : "";
		return fracStr.length > 0 ? `${prefix}${intPart}.${fracStr}` : `${prefix}${intPart}`;
	}

	toFixed(places: number): string {
		const negative = this.raw < 0n;
		const absRaw = negative ? -this.raw : this.raw;
		const intPart = absRaw / SCALE;
		const fracPart = absRaw % SCALE;
		const fracStr = fracPart.toString().padStart(PRECISION, "0").slice(0, places);
		const prefix = negative ? "-" : "";
		return places > 0 ? `${prefix}${intPart}.${fracStr}` : `${prefix}${intPart}`;
	}
}
