import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { CorrelationEngine } from "./correlation.js";

const d = (v: number) => Decimal.from(v);

describe("CorrelationEngine", () => {
	it("returns null with fewer than 2 samples", () => {
		const engine = CorrelationEngine.create({ windowSize: 10 });
		expect(engine.update(d(1), d(1))).toBeNull();
	});

	it("returns correlation after 2 samples", () => {
		const engine = CorrelationEngine.create({ windowSize: 10 });
		engine.update(d(1), d(2));
		const result = engine.update(d(2), d(4));
		expect(result).not.toBeNull();
		expect(result?.correlation.toNumber()).toBeCloseTo(1, 4);
	});

	it("detects perfect positive correlation", () => {
		const engine = CorrelationEngine.create({ windowSize: 10 });
		for (let i = 1; i <= 10; i++) {
			engine.update(d(i), d(i * 2));
		}
		const result = engine.update(d(11), d(22));
		expect(result?.correlation.toNumber()).toBeCloseTo(1, 4);
	});

	it("detects perfect negative correlation", () => {
		const engine = CorrelationEngine.create({ windowSize: 10 });
		for (let i = 1; i <= 10; i++) {
			engine.update(d(i), d(100 - i));
		}
		const result = engine.update(d(11), d(89));
		expect(result?.correlation.toNumber()).toBeCloseTo(-1, 2);
	});

	it("detects zero correlation for uncorrelated data", () => {
		const engine = CorrelationEngine.create({ windowSize: 20 });
		// Alternating pattern creates low correlation
		for (let i = 0; i < 20; i++) {
			engine.update(d(i), d(i % 2 === 0 ? 1 : -1));
		}
		const result = engine.update(d(20), d(1));
		expect(result).not.toBeNull();
		expect(Math.abs(result?.correlation.toNumber() ?? 0)).toBeLessThan(0.3);
	});

	it("detects regime shift", () => {
		const engine = CorrelationEngine.create({
			windowSize: 5,
			regimeShiftThreshold: Decimal.from("0.3"),
		});
		// Build up positive correlation
		for (let i = 1; i <= 5; i++) {
			engine.update(d(i), d(i));
		}
		// Sudden reversal
		let lastResult = engine.update(d(6), d(0));
		for (let i = 7; i <= 11; i++) {
			lastResult = engine.update(d(i), d(20 - i));
		}
		// At some point, shift should be detected
		expect(lastResult?.regimeShift).toBeDefined();
	});

	it("rolling window drops old data", () => {
		const engine = CorrelationEngine.create({ windowSize: 3 });
		engine.update(d(1), d(1));
		engine.update(d(2), d(2));
		engine.update(d(3), d(3));
		// Now window is full; adding more pushes out oldest
		engine.update(d(4), d(4));
		const result = engine.update(d(5), d(5));
		expect(result?.sampleCount).toBe(3);
	});

	it("resets state", () => {
		const engine = CorrelationEngine.create({ windowSize: 10 });
		engine.update(d(1), d(1));
		engine.update(d(2), d(2));
		engine.reset();
		expect(engine.update(d(3), d(3))).toBeNull();
	});
});
