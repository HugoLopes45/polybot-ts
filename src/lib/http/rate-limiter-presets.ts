import type { Clock } from "../../shared/time.js";
import { RateLimiterManager } from "./rate-limiter-manager.js";

/** Creates a RateLimiterManager pre-configured with Polymarket rate limits. */
export function polymarketPresets(clock: Clock): RateLimiterManager {
	const manager = new RateLimiterManager(clock);
	manager.getOrCreate("general", { capacity: 100, refillRate: 100 / 60 });
	manager.getOrCreate("order", { capacity: 30, refillRate: 30 / 60 });
	manager.getOrCreate("data", { capacity: 200, refillRate: 200 / 60 });
	return manager;
}
