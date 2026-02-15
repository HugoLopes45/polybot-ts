import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";

const isNormalNumber = (n: number): boolean => {
	return Number.isFinite(n) && Math.abs(n) >= 1e-30 && Math.abs(n) <= 1e30;
};

describe("Decimal (property-based)", () => {
	describe("commutativity", () => {
		it("addition is commutative: a + b === b + a", () => {
			fc.assert(
				fc.property(fc.nat(), fc.nat(), (fa, fb) => {
					const a = Decimal.from(fa);
					const b = Decimal.from(fb);
					const ab = a.add(b).toString();
					const ba = b.add(a).toString();
					expect(ab).toBe(ba);
				}),
				{ numRuns: 1000 },
			);
		});

		it("multiplication is commutative: a * b === b * a", () => {
			fc.assert(
				fc.property(fc.nat(), fc.nat(), (fa, fb) => {
					const a = Decimal.from(fa);
					const b = Decimal.from(fb);
					const ab = a.mul(b).toString();
					const ba = b.mul(a).toString();
					expect(ab).toBe(ba);
				}),
				{ numRuns: 1000 },
			);
		});
	});

	describe("associativity", () => {
		it("addition is associative: (a + b) + c === a + (b + c)", () => {
			fc.assert(
				fc.property(fc.nat(), fc.nat(), fc.nat(), (fa, fb, fcNum) => {
					if (!isNormalNumber(fa) || !isNormalNumber(fb) || !isNormalNumber(fcNum)) return true;
					const a = Decimal.from(fa);
					const b = Decimal.from(fb);
					const c = Decimal.from(fcNum);
					const ab_c = a.add(b).add(c).toString();
					const a_bc = a.add(b.add(c)).toString();
					expect(ab_c).toBe(a_bc);
				}),
				{ numRuns: 1000 },
			);
		});

		it("multiplication is associative: (a * b) * c === a * (b * c)", () => {
			fc.assert(
				fc.property(fc.nat({ min: 1 }), fc.nat({ min: 1 }), fc.nat({ min: 1 }), (fa, fb, fcNum) => {
					const a = Decimal.from(fa);
					const b = Decimal.from(fb);
					const c = Decimal.from(fcNum);
					const ab_c = a.mul(b).mul(c).toString();
					const a_bc = a.mul(b.mul(c)).toString();
					expect(ab_c).toBe(a_bc);
				}),
				{ numRuns: 1000 },
			);
		});
	});

	describe("distributivity", () => {
		it("multiplication distributes over addition: a * (b + c) === a*b + a*c", () => {
			fc.assert(
				fc.property(fc.nat(), fc.nat(), fc.nat(), (fa, fb, fcNum) => {
					if (!isNormalNumber(fa) || !isNormalNumber(fb) || !isNormalNumber(fcNum)) return true;
					const a = Decimal.from(fa);
					const b = Decimal.from(fb);
					const c = Decimal.from(fcNum);
					const lhs = a.mul(b.add(c)).toString();
					const rhs = a.mul(b).add(a.mul(c)).toString();
					expect(lhs).toBe(rhs);
				}),
				{ numRuns: 1000 },
			);
		});
	});

	describe("identity", () => {
		it("a + 0 === a", () => {
			fc.assert(
				fc.property(fc.nat(), (fa) => {
					const a = Decimal.from(fa);
					const result = a.add(Decimal.zero()).toString();
					expect(result).toBe(a.toString());
				}),
				{ numRuns: 1000 },
			);
		});

		it("a * 1 === a", () => {
			fc.assert(
				fc.property(fc.nat(), (fa) => {
					const a = Decimal.from(fa);
					const result = a.mul(Decimal.one()).toString();
					expect(result).toBe(a.toString());
				}),
				{ numRuns: 1000 },
			);
		});
	});

	describe("inverse", () => {
		it("a - a === 0", () => {
			fc.assert(
				fc.property(fc.nat(), (fa) => {
					const a = Decimal.from(fa);
					const result = a.sub(a).toString();
					expect(result).toBe("0");
				}),
				{ numRuns: 1000 },
			);
		});

		it("-(-a) === a", () => {
			fc.assert(
				fc.property(fc.nat(), (fa) => {
					const a = Decimal.from(fa);
					const result = a.neg().neg().toString();
					expect(result).toBe(a.toString());
				}),
				{ numRuns: 1000 },
			);
		});
	});

	describe("financial edge cases", () => {
		it("prediction market prices sum to 1", () => {
			fc.assert(
				fc.property(
					fc.record({
						price: fc.float({ min: Math.fround(0.001), max: Math.fround(0.999) }),
					}),
					(f) => {
						const fprice = f.price;
						if (!Number.isFinite(fprice) || fprice <= 0 || fprice >= 1) return true;
						const yes = Decimal.from(fprice);
						const no = Decimal.from("1").sub(yes);
						const sum = yes.add(no).toString();
						expect(sum).toBe("1");
					},
				),
				{ numRuns: 500 },
			);
		});
	});
});
