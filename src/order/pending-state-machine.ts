/**
 * Pending order state machine — validated transitions.
 *
 * 7-state machine: Created → Submitted → Open → PartiallyFilled → Filled/Cancelled/Expired
 *
 * Provides functions to check state validity and attempt transitions.
 */

import type { Result } from "../shared/result.js";
import { err, ok } from "../shared/result.js";
import { PendingState } from "./types.js";

const VALID_TRANSITIONS: ReadonlyMap<PendingState, readonly PendingState[]> = new Map([
	[PendingState.Created, [PendingState.Submitted]],
	[
		PendingState.Submitted,
		[PendingState.Open, PendingState.Filled, PendingState.Cancelled, PendingState.Expired],
	],
	[
		PendingState.Open,
		[
			PendingState.PartiallyFilled,
			PendingState.Filled,
			PendingState.Cancelled,
			PendingState.Expired,
		],
	],
	[
		PendingState.PartiallyFilled,
		[PendingState.PartiallyFilled, PendingState.Filled, PendingState.Cancelled],
	],
	[PendingState.Filled, []],
	[PendingState.Cancelled, []],
	[PendingState.Expired, []],
]);

const TERMINAL_STATES: ReadonlySet<PendingState> = new Set([
	PendingState.Filled,
	PendingState.Cancelled,
	PendingState.Expired,
]);

/**
 * Checks if a pending state is terminal (no further transitions possible).
 * @param state - The pending state to check
 * @returns True if the state is terminal (Filled, Cancelled, or Expired)
 *
 * @example
 * ```ts
 * isTerminal(PendingState.Filled); // true
 * isTerminal(PendingState.Open); // false
 * ```
 */
export function isTerminal(state: PendingState): boolean {
	return TERMINAL_STATES.has(state);
}

/**
 * Checks if a pending state is active (not terminal).
 * @param state - The pending state to check
 * @returns True if the state is active (Created, Submitted, Open, or PartiallyFilled)
 *
 * @example
 * ```ts
 * isActive(PendingState.Open); // true
 * isActive(PendingState.Filled); // false
 * ```
 */
export function isActive(state: PendingState): boolean {
	return !TERMINAL_STATES.has(state);
}

/**
 * Checks if a transition from one state to another is valid.
 * @param from - The current state
 * @param to - The target state
 * @returns True if the transition is allowed by the state machine
 *
 * @example
 * ```ts
 * canTransitionTo(PendingState.Created, PendingState.Submitted); // true
 * canTransitionTo(PendingState.Filled, PendingState.Open); // false
 * ```
 */
export function canTransitionTo(from: PendingState, to: PendingState): boolean {
	const valid = VALID_TRANSITIONS.get(from);
	if (!valid) return false;
	return valid.includes(to);
}

/**
 * Attempts to transition from one state to another.
 * @param from - The current state
 * @param to - The target state
 * @returns Ok(to) if transition is valid, Err with message if invalid
 *
 * @example
 * ```ts
 * const result = tryTransition(PendingState.Created, PendingState.Submitted);
 * if (result.ok) console.log("New state:", result.value);
 * ```
 */
export function tryTransition(from: PendingState, to: PendingState): Result<PendingState, string> {
	if (canTransitionTo(from, to)) {
		return ok(to);
	}
	return err(`Invalid transition: ${from} → ${to}`);
}
