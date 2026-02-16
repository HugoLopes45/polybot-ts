/**
 * Oracle dead-zone prediction for Chainlink-based settlement.
 *
 * Chainlink updates when:
 * - Price deviates > threshold% OR
 * - Heartbeat interval expires
 *
 * Between updates, oracle reports stale value — this "dead zone" is exploitable.
 */

import type { Decimal } from "../shared/decimal.js";
import type { Clock } from "../shared/time.js";

export interface OracleConfig {
	/** Deviation threshold that triggers an update (e.g., 0.005 = 0.5%). */
	readonly deviationThreshold: Decimal;
	/** Heartbeat interval in ms (e.g., 3600000 = 1 hour). */
	readonly heartbeatMs: number;
}

export interface OracleObservation {
	/** Last known oracle-reported value. */
	readonly oracleValue: Decimal;
	/** Timestamp of last oracle update (ms). */
	readonly lastUpdateMs: number;
	/** Current real-world spot price (from external source). */
	readonly realSpot: Decimal;
}

export interface SettlementPrediction {
	/** Whether the oracle is currently in a dead zone. */
	readonly inDeadZone: boolean;
	/** Predicted settlement value (what the oracle will report). */
	readonly predictedValue: Decimal;
	/** Time until next expected update (ms). -1 if imminent. */
	readonly timeUntilUpdateMs: number;
	/** Deviation from oracle to real spot. */
	readonly deviation: Decimal;
	/** Confidence: "high" if deviation < threshold and near heartbeat, "medium" otherwise, "low" if data stale. */
	readonly confidence: "high" | "medium" | "low";
}

/**
 * Models Chainlink oracle mechanics for prediction market settlement.
 *
 * Tracks dead zones where oracle won't update, enabling settlement value prediction.
 */
export class ChainlinkTracker {
	private constructor(
		private readonly config: OracleConfig,
		private readonly clock: Clock,
	) {}

	static create(config: OracleConfig, clock: Clock): ChainlinkTracker {
		return new ChainlinkTracker(config, clock);
	}

	/**
	 * Returns true if oracle is in dead zone (won't update).
	 *
	 * Dead zone: deviation < threshold AND time since last update < heartbeat.
	 */
	inDeadZone(obs: OracleObservation): boolean {
		const timeSinceUpdate = this.clock.now() - obs.lastUpdateMs;
		if (timeSinceUpdate >= this.config.heartbeatMs) {
			return false;
		}

		const deviation = this.calculateDeviation(obs);
		return deviation.abs().lt(this.config.deviationThreshold);
	}

	/**
	 * Predicts oracle settlement value at expiry.
	 *
	 * If expiry is soon AND in dead zone → oracle reports stale value.
	 * If deviation > threshold → oracle will update before expiry.
	 */
	predictSettlement(obs: OracleObservation, expiryMs: number): SettlementPrediction {
		const deviation = this.calculateDeviation(obs);
		const timeUntilUpdateMs = this.timeUntilNextUpdate(obs);
		const inDeadZone = this.inDeadZone(obs);
		const nowMs = this.clock.now();
		const timeUntilExpiry = expiryMs - nowMs;

		let predictedValue: Decimal;
		let confidence: "high" | "medium" | "low";

		if (inDeadZone && timeUntilUpdateMs > timeUntilExpiry) {
			// Dead zone + expiry before next update → oracle reports stale value
			predictedValue = obs.oracleValue;
			confidence = "high";
		} else if (deviation.abs().gte(this.config.deviationThreshold)) {
			// Deviation exceeded → oracle will update to real spot
			predictedValue = obs.realSpot;
			confidence = "medium";
		} else if (timeUntilUpdateMs <= 0) {
			// Update overdue → low confidence
			predictedValue = obs.realSpot;
			confidence = "low";
		} else {
			// In dead zone but expiry is far → oracle might update
			predictedValue = obs.oracleValue;
			confidence = "medium";
		}

		return {
			inDeadZone,
			predictedValue,
			timeUntilUpdateMs: timeUntilUpdateMs <= 0 ? -1 : timeUntilUpdateMs,
			deviation,
			confidence,
		};
	}

	/**
	 * Estimates ms until next oracle update.
	 *
	 * Returns min of:
	 * - Time until heartbeat expires
	 * - (theoretical) time for spot to drift to threshold
	 *
	 * Returns 0 if update is overdue.
	 */
	timeUntilNextUpdate(obs: OracleObservation): number {
		const timeSinceUpdate = this.clock.now() - obs.lastUpdateMs;
		const timeUntilHeartbeat = this.config.heartbeatMs - timeSinceUpdate;

		if (timeUntilHeartbeat <= 0) {
			return 0;
		}

		const deviation = this.calculateDeviation(obs);
		if (deviation.abs().gte(this.config.deviationThreshold)) {
			return 0;
		}

		// For now, return heartbeat time (we can't predict spot drift rate)
		return timeUntilHeartbeat;
	}

	private calculateDeviation(obs: OracleObservation): Decimal {
		if (obs.oracleValue.isZero()) {
			return obs.realSpot;
		}
		return obs.realSpot.sub(obs.oracleValue).div(obs.oracleValue);
	}
}
