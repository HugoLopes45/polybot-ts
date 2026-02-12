/**
 * Pending order state machine — validated transitions.
 *
 * 7-state machine: Created → Submitted → Open → PartiallyFilled → Filled/Cancelled/Expired
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

export function isTerminal(state: PendingState): boolean {
	return TERMINAL_STATES.has(state);
}

export function isActive(state: PendingState): boolean {
	return !TERMINAL_STATES.has(state);
}

export function canTransitionTo(from: PendingState, to: PendingState): boolean {
	const valid = VALID_TRANSITIONS.get(from);
	if (!valid) return false;
	return valid.includes(to);
}

export function tryTransition(from: PendingState, to: PendingState): Result<PendingState, string> {
	if (canTransitionTo(from, to)) {
		return ok(to);
	}
	return err(`Invalid transition: ${from} → ${to}`);
}
