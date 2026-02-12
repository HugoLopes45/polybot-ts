export {
	StrategyState,
	PauseReason,
	HaltReason,
	WatchdogStatus,
	StateErrorKind,
	type StateTransition,
	type StateSnapshot,
	type StateMetadata,
	type StateError,
} from "./types.js";

export { StrategyStateMachine } from "./state-machine.js";

export {
	ConnectivityWatchdog,
	DEFAULT_WATCHDOG_CONFIG,
	type WatchdogConfig,
} from "./watchdog.js";
