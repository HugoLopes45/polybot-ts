/**
 * StrategyStateMachine — validated lifecycle FSM.
 *
 * All transitions go through transition() which validates the move.
 * History is bounded (last N transitions) for debugging.
 */

import type { Result } from "../shared/result.js";
import { err, ok } from "../shared/result.js";
import type { Clock } from "../shared/time.js";
import { SystemClock } from "../shared/time.js";
import {
	type StateError,
	StateErrorKind,
	type StateMetadata,
	type StateSnapshot,
	type StateTransition,
	StrategyState,
} from "./types.js";

const MAX_HISTORY = 100;

export class StrategyStateMachine {
	private current: StrategyState;
	private currentEnteredAt: number;
	private currentMetadata: StateMetadata;
	private readonly transitions: Array<{
		readonly from: StrategyState;
		readonly to: StrategyState;
		readonly transition: StateTransition["type"];
		readonly timestamp: number;
	}>;
	private readonly clock: Clock;

	constructor(clock: Clock = SystemClock) {
		this.clock = clock;
		this.current = StrategyState.Initializing;
		this.currentEnteredAt = clock.now();
		this.currentMetadata = { type: "none" };
		this.transitions = [];
	}

	// ── Queries ────────────────────────────────────────────────────

	state(): StrategyState {
		return this.current;
	}

	snapshot(): StateSnapshot {
		return {
			state: this.current,
			enteredAt: this.currentEnteredAt,
			metadata: this.currentMetadata,
		};
	}

	/** Can we open new positions in the current state? */
	canOpen(): boolean {
		return this.current === StrategyState.Active;
	}

	/** Can we close/exit positions in the current state? */
	canClose(): boolean {
		return (
			this.current === StrategyState.Active ||
			this.current === StrategyState.Paused ||
			this.current === StrategyState.ClosingOnly
		);
	}

	/** Time spent in the current state (ms) */
	timeInState(): number {
		return this.clock.now() - this.currentEnteredAt;
	}

	/** Bounded transition history (most recent last) */
	history(): ReadonlyArray<{
		readonly from: StrategyState;
		readonly to: StrategyState;
		readonly transition: StateTransition["type"];
		readonly timestamp: number;
	}> {
		return this.transitions;
	}

	// ── Transitions ────────────────────────────────────────────────

	transition(t: StateTransition): Result<StrategyState, StateError> {
		const from = this.current;

		// Terminal state — nothing allowed except already-shutdown
		if (from === StrategyState.Shutdown) {
			return err({
				kind: StateErrorKind.AlreadyTerminal,
				message: "Strategy already shut down",
				from,
				transition: t.type,
			});
		}

		const result = this.validateTransition(from, t);
		if (!result.ok) return result;

		const { state, metadata } = result.value;
		this.recordTransition(from, state, t.type);
		this.current = state;
		this.currentEnteredAt = this.clock.now();
		this.currentMetadata = metadata;

		return ok(state);
	}

	// ── Validation ─────────────────────────────────────────────────

	private validateTransition(
		from: StrategyState,
		t: StateTransition,
	): Result<{ state: StrategyState; metadata: StateMetadata }, StateError> {
		switch (t.type) {
			case "initialize":
				if (from === StrategyState.Initializing) {
					return ok({
						state: StrategyState.WarmingUp,
						metadata: { type: "warmup", progressPct: 0 },
					});
				}
				break;

			case "update_warmup":
				if (from === StrategyState.WarmingUp) {
					return ok({
						state: StrategyState.WarmingUp,
						metadata: { type: "warmup", progressPct: Math.min(100, Math.max(0, t.progressPct)) },
					});
				}
				break;

			case "warmup_complete":
				if (from === StrategyState.WarmingUp) {
					return ok({ state: StrategyState.Active, metadata: { type: "none" } });
				}
				break;

			case "pause":
				if (from === StrategyState.Active || from === StrategyState.WarmingUp) {
					return ok({ state: StrategyState.Paused, metadata: { type: "pause", reason: t.reason } });
				}
				break;

			case "resume":
				if (from === StrategyState.Paused) {
					return ok({ state: StrategyState.Active, metadata: { type: "none" } });
				}
				if (from === StrategyState.Halted) {
					return err({
						kind: StateErrorKind.CannotResumeFromHalt,
						message: "Cannot resume from Halted state — only shutdown is allowed",
						from,
						transition: t.type,
					});
				}
				break;

			case "enter_closing_only":
				if (
					from === StrategyState.Active ||
					from === StrategyState.WarmingUp ||
					from === StrategyState.Paused
				) {
					return ok({ state: StrategyState.ClosingOnly, metadata: { type: "none" } });
				}
				break;

			case "halt":
				if (from !== StrategyState.Shutdown) {
					return ok({ state: StrategyState.Halted, metadata: { type: "halt", reason: t.reason } });
				}
				break;

			case "shutdown":
				// Any non-terminal state can shutdown
				return ok({ state: StrategyState.Shutdown, metadata: { type: "none" } });
		}

		return err({
			kind: StateErrorKind.InvalidTransition,
			message: `Cannot transition from ${from} via ${t.type}`,
			from,
			transition: t.type,
		});
	}

	private recordTransition(
		from: StrategyState,
		to: StrategyState,
		transition: StateTransition["type"],
	): void {
		if (this.transitions.length >= MAX_HISTORY) {
			this.transitions.shift();
		}
		this.transitions.push({ from, to, transition, timestamp: this.clock.now() });
	}
}
