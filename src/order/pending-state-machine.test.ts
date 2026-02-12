import { describe, expect, it } from "vitest";
import { isErr, isOk } from "../shared/result.js";
import { canTransitionTo, isTerminal, tryTransition } from "./pending-state-machine.js";
import { PendingState } from "./types.js";

describe("PendingStateMachine", () => {
	describe("isTerminal", () => {
		it.each([
			[PendingState.Filled, true],
			[PendingState.Cancelled, true],
			[PendingState.Expired, true],
			[PendingState.Created, false],
			[PendingState.Submitted, false],
			[PendingState.Open, false],
			[PendingState.PartiallyFilled, false],
		] as const)("%s is terminal: %s", (state, expected) => {
			expect(isTerminal(state)).toBe(expected);
		});
	});

	describe("canTransitionTo — valid transitions", () => {
		it.each([
			[PendingState.Created, PendingState.Submitted],
			[PendingState.Submitted, PendingState.Open],
			[PendingState.Submitted, PendingState.Filled],
			[PendingState.Submitted, PendingState.Cancelled],
			[PendingState.Submitted, PendingState.Expired],
			[PendingState.Open, PendingState.PartiallyFilled],
			[PendingState.Open, PendingState.Filled],
			[PendingState.Open, PendingState.Cancelled],
			[PendingState.Open, PendingState.Expired],
			[PendingState.PartiallyFilled, PendingState.PartiallyFilled],
			[PendingState.PartiallyFilled, PendingState.Filled],
			[PendingState.PartiallyFilled, PendingState.Cancelled],
		] as const)("%s → %s is valid", (from, to) => {
			expect(canTransitionTo(from, to)).toBe(true);
		});
	});

	describe("canTransitionTo — invalid transitions", () => {
		it.each([
			[PendingState.Filled, PendingState.Cancelled],
			[PendingState.Cancelled, PendingState.Filled],
			[PendingState.Expired, PendingState.Open],
			[PendingState.Created, PendingState.Filled],
			[PendingState.Open, PendingState.Created],
			[PendingState.Open, PendingState.Submitted],
		] as const)("%s → %s is invalid", (from, to) => {
			expect(canTransitionTo(from, to)).toBe(false);
		});
	});

	describe("tryTransition", () => {
		it("returns new state on valid transition", () => {
			const result = tryTransition(PendingState.Created, PendingState.Submitted);
			expect(isOk(result)).toBe(true);
			if (isOk(result)) {
				expect(result.value).toBe(PendingState.Submitted);
			}
		});

		it("returns error on invalid transition", () => {
			const result = tryTransition(PendingState.Filled, PendingState.Open);
			expect(isErr(result)).toBe(true);
			if (isErr(result)) {
				expect(result.error).toContain("Invalid transition");
			}
		});

		it("all terminal states reject all transitions", () => {
			const terminals = [PendingState.Filled, PendingState.Cancelled, PendingState.Expired];
			const allStates = Object.values(PendingState);

			for (const from of terminals) {
				for (const to of allStates) {
					expect(canTransitionTo(from, to)).toBe(false);
				}
			}
		});
	});
});
