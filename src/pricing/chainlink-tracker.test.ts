import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { FakeClock } from "../shared/time.js";
import { ChainlinkTracker } from "./chainlink-tracker.js";
import type { OracleConfig, OracleObservation } from "./chainlink-tracker.js";

const config: OracleConfig = {
	deviationThreshold: Decimal.from("0.005"),
	heartbeatMs: 3600_000,
};

function makeObs(oracleValue: string, realSpot: string, lastUpdateMs: number): OracleObservation {
	return {
		oracleValue: Decimal.from(oracleValue),
		realSpot: Decimal.from(realSpot),
		lastUpdateMs,
	};
}

describe("ChainlinkTracker", () => {
	describe("inDeadZone", () => {
		it("returns true when deviation below threshold and within heartbeat", () => {
			const clock = new FakeClock(1_000_000);
			const tracker = ChainlinkTracker.create(config, clock);
			// Oracle at 100, real at 100.3 → 0.3% deviation < 0.5% threshold
			// Last update 10min ago, heartbeat 60min → within heartbeat
			const obs = makeObs("100", "100.3", 1_000_000 - 600_000);
			expect(tracker.inDeadZone(obs)).toBe(true);
		});

		it("returns false when deviation above threshold", () => {
			const clock = new FakeClock(1_000_000);
			const tracker = ChainlinkTracker.create(config, clock);
			// Oracle at 100, real at 101 → 1% deviation > 0.5% threshold
			const obs = makeObs("100", "101", 1_000_000 - 600_000);
			expect(tracker.inDeadZone(obs)).toBe(false);
		});

		it("returns false when heartbeat expired", () => {
			const clock = new FakeClock(5_000_000);
			const tracker = ChainlinkTracker.create(config, clock);
			// Within deviation threshold but heartbeat expired
			const obs = makeObs("100", "100.1", 1_000_000);
			expect(tracker.inDeadZone(obs)).toBe(false);
		});

		it("returns true when deviation exactly at boundary (below threshold)", () => {
			const clock = new FakeClock(1_000_000);
			const tracker = ChainlinkTracker.create(config, clock);
			// Oracle at 100, real at 100.4 → 0.4% < 0.5%
			const obs = makeObs("100", "100.4", 1_000_000 - 600_000);
			expect(tracker.inDeadZone(obs)).toBe(true);
		});

		it("handles zero oracle value gracefully", () => {
			const clock = new FakeClock(1_000_000);
			const tracker = ChainlinkTracker.create(config, clock);
			// Zero oracle: deviation = realSpot itself (non-zero)
			const obs = makeObs("0", "0.001", 1_000_000 - 100_000);
			// deviation = 0.001 which is >= 0.005 threshold? No, 0.001 < 0.005
			// Actually when oracleValue=0, deviation = realSpot = 0.001
			// 0.001 < 0.005 → dead zone
			expect(tracker.inDeadZone(obs)).toBe(true);
		});
	});

	describe("timeUntilNextUpdate", () => {
		it("returns heartbeat remaining when in dead zone", () => {
			const clock = new FakeClock(1_000_000);
			const tracker = ChainlinkTracker.create(config, clock);
			const obs = makeObs("100", "100.1", 1_000_000 - 600_000);
			// 3600000 - 600000 = 3000000ms remaining
			expect(tracker.timeUntilNextUpdate(obs)).toBe(3_000_000);
		});

		it("returns 0 when heartbeat expired (overdue)", () => {
			const clock = new FakeClock(5_000_000);
			const tracker = ChainlinkTracker.create(config, clock);
			const obs = makeObs("100", "100.1", 1_000_000);
			expect(tracker.timeUntilNextUpdate(obs)).toBe(0);
		});

		it("returns 0 when deviation exceeds threshold (update imminent)", () => {
			const clock = new FakeClock(1_000_000);
			const tracker = ChainlinkTracker.create(config, clock);
			// 2% deviation > 0.5% threshold → update expected immediately
			const obs = makeObs("100", "102", 1_000_000 - 100_000);
			expect(tracker.timeUntilNextUpdate(obs)).toBe(0);
		});
	});

	describe("predictSettlement", () => {
		it("predicts stale oracle value when in dead zone and expiry before next update", () => {
			const clock = new FakeClock(1_000_000);
			const tracker = ChainlinkTracker.create(config, clock);
			const obs = makeObs("100", "100.2", 1_000_000 - 100_000);
			// Expiry in 30s (1_000_000 + 30_000), next update in 3500s
			const prediction = tracker.predictSettlement(obs, 1_030_000);

			expect(prediction.inDeadZone).toBe(true);
			expect(prediction.predictedValue.toString()).toBe("100");
			expect(prediction.confidence).toBe("high");
		});

		it("predicts update to real spot when deviation exceeds threshold", () => {
			const clock = new FakeClock(1_000_000);
			const tracker = ChainlinkTracker.create(config, clock);
			// 2% deviation → oracle will update
			const obs = makeObs("100", "102", 1_000_000 - 100_000);
			const prediction = tracker.predictSettlement(obs, 2_000_000);

			expect(prediction.inDeadZone).toBe(false);
			expect(prediction.predictedValue.toString()).toBe("102");
			expect(prediction.confidence).toBe("medium");
		});

		it("returns medium confidence when in dead zone but expiry is far", () => {
			const clock = new FakeClock(1_000_000);
			const tracker = ChainlinkTracker.create(config, clock);
			const obs = makeObs("100", "100.2", 1_000_000 - 100_000);
			// Expiry in 2 hours → oracle may update before then
			const prediction = tracker.predictSettlement(obs, 1_000_000 + 7_200_000);

			expect(prediction.inDeadZone).toBe(true);
			expect(prediction.predictedValue.toString()).toBe("100");
			expect(prediction.confidence).toBe("medium");
		});

		it("returns low confidence when update is overdue", () => {
			const clock = new FakeClock(5_000_000);
			const tracker = ChainlinkTracker.create(config, clock);
			const obs = makeObs("100", "100.2", 1_000_000);
			const prediction = tracker.predictSettlement(obs, 6_000_000);

			expect(prediction.confidence).toBe("low");
			expect(prediction.timeUntilUpdateMs).toBe(-1);
		});

		it("returns deviation between oracle and real spot", () => {
			const clock = new FakeClock(1_000_000);
			const tracker = ChainlinkTracker.create(config, clock);
			const obs = makeObs("100", "101", 1_000_000 - 100_000);
			const prediction = tracker.predictSettlement(obs, 2_000_000);

			// deviation = (101 - 100) / 100 = 0.01
			expect(prediction.deviation.toNumber()).toBeCloseTo(0.01, 6);
		});
	});
});
