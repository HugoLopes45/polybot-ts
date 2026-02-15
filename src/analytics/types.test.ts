import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { isErr, isOk } from "../shared/result.js";
import { createCandle } from "./types.js";

const d = (v: number | string) => Decimal.from(v);

const validInput = {
	open: d(100),
	high: d(110),
	low: d(90),
	close: d(105),
	volume: d(1000),
	timestampMs: 1000,
};

describe("createCandle", () => {
	it("creates a valid candle", () => {
		const result = createCandle(validInput);
		expect(isOk(result)).toBe(true);
		if (isOk(result)) {
			expect(result.value.open.toString()).toBe("100");
			expect(result.value.high.toString()).toBe("110");
			expect(result.value.low.toString()).toBe("90");
			expect(result.value.close.toString()).toBe("105");
			expect(result.value.volume.toString()).toBe("1000");
			expect(result.value.timestampMs).toBe(1000);
		}
	});

	it("accepts candle with all prices equal", () => {
		const result = createCandle({
			open: d(50),
			high: d(50),
			low: d(50),
			close: d(50),
			volume: d(10),
			timestampMs: 0,
		});
		expect(isOk(result)).toBe(true);
	});

	it("accepts zero volume", () => {
		const result = createCandle({ ...validInput, volume: d(0) });
		expect(isOk(result)).toBe(true);
	});

	it("accepts zero timestampMs", () => {
		const result = createCandle({ ...validInput, timestampMs: 0 });
		expect(isOk(result)).toBe(true);
	});

	it("rejects negative volume", () => {
		const result = createCandle({ ...validInput, volume: d(-1) });
		expect(isErr(result)).toBe(true);
		if (isErr(result)) {
			expect(result.error.code).toBe("INVALID_CANDLE");
			expect(result.error.message).toContain("volume");
		}
	});

	it("rejects negative timestampMs", () => {
		const result = createCandle({ ...validInput, timestampMs: -1 });
		expect(isErr(result)).toBe(true);
		if (isErr(result)) {
			expect(result.error.code).toBe("INVALID_CANDLE");
			expect(result.error.message).toContain("timestampMs");
		}
	});

	it("rejects high below open", () => {
		const result = createCandle({ ...validInput, high: d(95) });
		expect(isErr(result)).toBe(true);
		if (isErr(result)) {
			expect(result.error.code).toBe("INVALID_CANDLE");
			expect(result.error.message).toContain("high");
		}
	});

	it("rejects high below close", () => {
		const result = createCandle({ ...validInput, high: d(103) });
		expect(isErr(result)).toBe(true);
		if (isErr(result)) {
			expect(result.error.code).toBe("INVALID_CANDLE");
			expect(result.error.message).toContain("high");
		}
	});

	it("rejects high below low", () => {
		const result = createCandle({
			open: d(50),
			high: d(40),
			low: d(45),
			close: d(48),
			volume: d(10),
			timestampMs: 0,
		});
		expect(isErr(result)).toBe(true);
		if (isErr(result)) {
			expect(result.error.code).toBe("INVALID_CANDLE");
		}
	});

	it("rejects low above open", () => {
		const result = createCandle({ ...validInput, low: d(102) });
		expect(isErr(result)).toBe(true);
		if (isErr(result)) {
			expect(result.error.code).toBe("INVALID_CANDLE");
			expect(result.error.message).toContain("low");
		}
	});

	it("rejects low above close", () => {
		const result = createCandle({
			open: d(100),
			high: d(110),
			low: d(107),
			close: d(105),
			volume: d(10),
			timestampMs: 0,
		});
		expect(isErr(result)).toBe(true);
		if (isErr(result)) {
			expect(result.error.code).toBe("INVALID_CANDLE");
			expect(result.error.message).toContain("low");
		}
	});
});
