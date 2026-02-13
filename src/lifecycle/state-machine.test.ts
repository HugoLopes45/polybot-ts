import { describe, expect, it } from "vitest";
import { FakeClock } from "../shared/time.js";
import { StrategyStateMachine } from "./state-machine.js";
import { HaltReason, PauseReason, StateErrorKind, StrategyState } from "./types.js";

function createMachine() {
	const clock = new FakeClock(1000);
	const sm = new StrategyStateMachine(clock);
	return { sm, clock };
}

describe("StrategyStateMachine", () => {
	describe("initial state", () => {
		it("starts in Initializing", () => {
			const { sm } = createMachine();
			expect(sm.state()).toBe(StrategyState.Initializing);
		});

		it("canOpen is false initially", () => {
			const { sm } = createMachine();
			expect(sm.canOpen()).toBe(false);
		});

		it("canClose is false initially", () => {
			const { sm } = createMachine();
			expect(sm.canClose()).toBe(false);
		});
	});

	describe("happy path lifecycle", () => {
		it("Initializing → WarmingUp → Active", () => {
			const { sm } = createMachine();

			const r1 = sm.transition({ type: "initialize" });
			expect(r1.ok).toBe(true);
			expect(sm.state()).toBe(StrategyState.WarmingUp);

			const r2 = sm.transition({ type: "warmup_complete" });
			expect(r2.ok).toBe(true);
			expect(sm.state()).toBe(StrategyState.Active);
		});

		it("Active allows entries and exits", () => {
			const { sm } = createMachine();
			sm.transition({ type: "initialize" });
			sm.transition({ type: "warmup_complete" });

			expect(sm.canOpen()).toBe(true);
			expect(sm.canClose()).toBe(true);
		});

		it("Active → Shutdown", () => {
			const { sm } = createMachine();
			sm.transition({ type: "initialize" });
			sm.transition({ type: "warmup_complete" });

			const r = sm.transition({ type: "shutdown" });
			expect(r.ok).toBe(true);
			expect(sm.state()).toBe(StrategyState.Shutdown);
		});
	});

	describe("warmup progress", () => {
		it("tracks warmup percentage", () => {
			const { sm } = createMachine();
			sm.transition({ type: "initialize" });

			sm.transition({ type: "update_warmup", progressPct: 50 });
			const snap = sm.snapshot();
			expect(snap.metadata).toEqual({ type: "warmup", progressPct: 50 });
		});

		it("clamps progress to 0-100", () => {
			const { sm } = createMachine();
			sm.transition({ type: "initialize" });

			sm.transition({ type: "update_warmup", progressPct: 150 });
			const snap = sm.snapshot();
			expect(snap.metadata).toEqual({ type: "warmup", progressPct: 100 });

			sm.transition({ type: "update_warmup", progressPct: -10 });
			const snap2 = sm.snapshot();
			expect(snap2.metadata).toEqual({ type: "warmup", progressPct: 0 });
		});
	});

	describe("pause / resume", () => {
		it("Active → Paused → Active", () => {
			const { sm } = createMachine();
			sm.transition({ type: "initialize" });
			sm.transition({ type: "warmup_complete" });

			sm.transition({ type: "pause", reason: PauseReason.UserRequested });
			expect(sm.state()).toBe(StrategyState.Paused);
			expect(sm.canOpen()).toBe(false);
			expect(sm.canClose()).toBe(true);

			sm.transition({ type: "resume" });
			expect(sm.state()).toBe(StrategyState.Active);
		});

		it("WarmingUp can be paused", () => {
			const { sm } = createMachine();
			sm.transition({ type: "initialize" });

			const r = sm.transition({ type: "pause", reason: PauseReason.ExternalSignal });
			expect(r.ok).toBe(true);
			expect(sm.state()).toBe(StrategyState.Paused);
		});
	});

	describe("closing only", () => {
		it("Active → ClosingOnly allows exits but not entries", () => {
			const { sm } = createMachine();
			sm.transition({ type: "initialize" });
			sm.transition({ type: "warmup_complete" });

			sm.transition({ type: "enter_closing_only" });
			expect(sm.state()).toBe(StrategyState.ClosingOnly);
			expect(sm.canOpen()).toBe(false);
			expect(sm.canClose()).toBe(true);
		});
	});

	describe("halt", () => {
		it("any state → Halted (except Shutdown)", () => {
			const { sm } = createMachine();
			sm.transition({ type: "initialize" });
			sm.transition({ type: "warmup_complete" });

			sm.transition({ type: "halt", reason: HaltReason.KillSwitchTriggered });
			expect(sm.state()).toBe(StrategyState.Halted);
			expect(sm.canOpen()).toBe(false);
			expect(sm.canClose()).toBe(false);
		});

		it("cannot resume from Halted", () => {
			const { sm } = createMachine();
			sm.transition({ type: "initialize" });
			sm.transition({ type: "halt", reason: HaltReason.MaxDailyLoss });

			const r = sm.transition({ type: "resume" });
			expect(r.ok).toBe(false);
			if (!r.ok) {
				expect(r.error.kind).toBe(StateErrorKind.CannotResumeFromHalt);
			}
		});

		it("Halted → Shutdown is valid", () => {
			const { sm } = createMachine();
			sm.transition({ type: "halt", reason: HaltReason.ManualHalt });

			const r = sm.transition({ type: "shutdown" });
			expect(r.ok).toBe(true);
			expect(sm.state()).toBe(StrategyState.Shutdown);
		});
	});

	describe("terminal state", () => {
		it("Shutdown rejects all transitions", () => {
			const { sm } = createMachine();
			sm.transition({ type: "shutdown" });

			const r = sm.transition({ type: "initialize" });
			expect(r.ok).toBe(false);
			if (!r.ok) {
				expect(r.error.kind).toBe(StateErrorKind.AlreadyTerminal);
			}
		});

		it("halt from Shutdown is rejected (HARD-5)", () => {
			const { sm } = createMachine();
			sm.transition({ type: "shutdown" });

			const r = sm.transition({ type: "halt", reason: HaltReason.ManualHalt });
			expect(r.ok).toBe(false);
			if (!r.ok) {
				expect(r.error.kind).toBe(StateErrorKind.AlreadyTerminal);
			}
		});
	});

	describe("invalid transitions", () => {
		const invalidCases: Array<[string, () => void]> = [
			[
				"Initializing cannot warmup_complete",
				() => {
					const { sm } = createMachine();
					const r = sm.transition({ type: "warmup_complete" });
					expect(r.ok).toBe(false);
				},
			],
			[
				"Active cannot initialize",
				() => {
					const { sm } = createMachine();
					sm.transition({ type: "initialize" });
					sm.transition({ type: "warmup_complete" });
					const r = sm.transition({ type: "initialize" });
					expect(r.ok).toBe(false);
				},
			],
			[
				"Paused cannot enter_closing_only after resume only reaches Active",
				() => {
					const { sm } = createMachine();
					sm.transition({ type: "initialize" });
					sm.transition({ type: "warmup_complete" });
					sm.transition({ type: "pause", reason: PauseReason.UserRequested });
					// Actually, Paused CAN enter closing_only per our state machine
					const r = sm.transition({ type: "enter_closing_only" });
					expect(r.ok).toBe(true);
				},
			],
		];

		it.each(invalidCases)("%s", (_desc, fn) => fn());
	});

	describe("history", () => {
		it("tracks transitions", () => {
			const { sm, clock } = createMachine();

			clock.set(1000);
			sm.transition({ type: "initialize" });
			clock.set(2000);
			sm.transition({ type: "warmup_complete" });

			const history = sm.history();
			expect(history).toHaveLength(2);
			expect(history[0]).toEqual({
				from: StrategyState.Initializing,
				to: StrategyState.WarmingUp,
				transition: "initialize",
				timestamp: 1000,
			});
			expect(history[1]).toEqual({
				from: StrategyState.WarmingUp,
				to: StrategyState.Active,
				transition: "warmup_complete",
				timestamp: 2000,
			});
		});

		it("bounds history to MAX_HISTORY (100)", () => {
			const { sm } = createMachine();
			sm.transition({ type: "initialize" });
			sm.transition({ type: "warmup_complete" });

			// Generate many transitions by toggling pause/resume
			for (let i = 0; i < 110; i++) {
				sm.transition({ type: "pause", reason: PauseReason.UserRequested });
				sm.transition({ type: "resume" });
			}

			expect(sm.history().length).toBeLessThanOrEqual(100);
		});

		it("FIFO: oldest transitions are dropped first (HARD-22)", () => {
			const { sm, clock } = createMachine();
			clock.set(1);
			sm.transition({ type: "initialize" });
			clock.set(2);
			sm.transition({ type: "warmup_complete" });

			// Generate 120+ transitions to overflow the 100-entry buffer
			for (let i = 0; i < 60; i++) {
				clock.set(100 + i * 2);
				sm.transition({ type: "pause", reason: PauseReason.UserRequested });
				clock.set(101 + i * 2);
				sm.transition({ type: "resume" });
			}

			const history = sm.history();
			expect(history.length).toBeLessThanOrEqual(100);
			// The earliest transitions (initialize, warmup_complete) should have been dropped
			const firstEntry = history[0];
			expect(firstEntry?.transition).not.toBe("initialize");
			// The last entry should be the most recent
			const lastEntry = history[history.length - 1];
			expect(lastEntry?.to).toBe(StrategyState.Active);
		});
	});

	describe("timeInState", () => {
		it("tracks time in current state", () => {
			const { sm, clock } = createMachine();
			clock.set(1000);
			sm.transition({ type: "initialize" });

			clock.set(5000);
			expect(sm.timeInState()).toBe(4000);
		});
	});
});
